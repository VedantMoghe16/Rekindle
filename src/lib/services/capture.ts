import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { now, todayIso } from "@/lib/clock";
import { parseWhatsApp } from "@/lib/parsers/whatsapp";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { MemoryExtraction, StallCategory, type MemoryExtraction as MemoryExtractionT } from "@/lib/schemas";
import { verifyEvidence } from "@/lib/engines/evidence";
import { extractionPrompt, type ExtractionContext } from "@/lib/prompts/extraction";
import { runMatcher, upsertComputedSignals, type LaneChangeResult } from "@/lib/services/matcher";
import { categoriesForText, ingestDeal } from "@/lib/services/knowledge";

export const CHANNELS = ["whatsapp", "email", "call", "meeting", "note"] as const;
export type Channel = (typeof CHANNELS)[number];
export type ExtractionProvenance = "live" | "cached" | "rules";

const MAX_CHARS = 12_000;
const DAY = 86_400_000;

export function hashContent(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function istStamp(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const MONTH_DATE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*,?\s+(\d{4})\b/i;

/** Normalizes a pasted conversation (spec §7.1 step 1) and infers when it happened. */
export function normalizeConversation(text: string, channel: string) {
  let normalized: string;
  let interactionDate: Date | null = null;
  let participants: string[] = [];
  if (channel === "whatsapp") {
    const parsed = parseWhatsApp(text);
    normalized = parsed.messages.map((m) => `[${istStamp(m.timestamp)}] ${m.speaker}: ${m.text}`).join("\n");
    participants = parsed.participants;
    const last = parsed.messages.at(-1);
    if (last) interactionDate = new Date(last.timestamp);
  } else {
    normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const head = normalized.split("\n").slice(0, 8).join("\n");
    const header = head.match(/^date:\s*(.+)$/im)?.[1];
    const match = (header && header.match(MONTH_DATE)) || head.match(MONTH_DATE);
    if (match) {
      const parsed = new Date(`${match[1]} ${match[2]} ${match[3]} 12:00 GMT+0530`);
      if (!Number.isNaN(parsed.getTime())) interactionDate = parsed;
    } else if (header && !Number.isNaN(new Date(header).getTime())) interactionDate = new Date(header);
    participants = [...new Set(normalized.split("\n").map((line) => line.match(/^([A-Z][\p{L} .'-]{1,40}?)(?:\s*\([^)]*\))?:\s/u)?.[1]?.trim()).filter((s): s is string => Boolean(s)))];
  }
  const truncated = normalized.length > MAX_CHARS;
  if (truncated) normalized = `[earlier messages truncated]\n${normalized.slice(-MAX_CHARS)}`;
  const today = now();
  if (!interactionDate || interactionDate.getTime() > today.getTime() + DAY) interactionDate = today;
  return { normalized, truncated, interactionDate, participants };
}

export type ExtractionCtx = Omit<ExtractionContext, "interactionDate" | "today"> & { interactionDate: Date };

export async function buildExtractionContext(accountId: string, channel: string, interactionDate: Date): Promise<ExtractionCtx | null> {
  const [account, seller] = await Promise.all([
    db.account.findUnique({ where: { id: accountId }, include: { contacts: true } }),
    db.sellerProfile.findFirst(),
  ]);
  if (!account) return null;
  const changelog = seller ? JSON.parse(seller.changelogJson) as { featureKey: string; title: string }[] : [];
  const contact = account.contacts.find((c) => c.role === "champion") ?? account.contacts[0];
  return {
    seller: { name: seller?.name ?? "Seller", oneLiner: seller?.oneLiner ?? "" },
    featureKeys: changelog.map((entry) => ({ key: entry.featureKey, description: entry.title })),
    accountName: account.name, contactName: contact?.name ?? null, contactTitle: contact?.title ?? null, repName: seller?.repName ?? null,
    channel, interactionDate,
  };
}

export type ExtractedMemory = MemoryExtractionT & { evidence_verified: boolean };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function clampDate(value: string | null, from: Date): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T06:30:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(`${isoDate(from)}T00:00:00Z`).getTime();
  const end = new Date(from); end.setUTCMonth(end.getUTCMonth() + 24);
  return date.getTime() >= start && date.getTime() <= end.getTime() ? value.slice(0, 10) : null;
}

/** Post-processing for any extraction: evidence verification (§7.1.4) and date sanity (§7.1.5). */
export function finalizeExtraction(raw: MemoryExtractionT, normalized: string, interactionDate: Date): ExtractedMemory {
  const evidence = verifyEvidence(raw.evidence_quote, normalized);
  const quote = evidence.quote.length > 220 ? evidence.quote.slice(0, 220) : evidence.quote;
  return {
    ...raw,
    evidence_quote: quote,
    evidence_date: clampDate(raw.evidence_date, new Date(interactionDate.getTime() - 400 * DAY)) ?? isoDate(interactionDate),
    stated_timing: { ...raw.stated_timing, resolved_date: clampDate(raw.stated_timing.resolved_date, interactionDate) },
    competitor: { ...raw.competitor, contract_end_date: clampDate(raw.competitor.contract_end_date, interactionDate) },
    commitments: raw.commitments.map((c) => ({ ...c, due_date: clampDate(c.due_date, interactionDate) })),
    confidence: evidence.verified ? raw.confidence : Math.min(raw.confidence, 0.4),
    evidence_verified: evidence.verified,
  };
}

/** Deterministic fallback: picks the buyer sentence that most clearly names a blocker. */
export function rulesExtraction(normalized: string, ctx: Pick<ExtractionCtx, "repName">): MemoryExtractionT {
  const rep = (ctx.repName ?? "").toLowerCase().split(" ")[0];
  const sender = normalized.match(/^from:\s*"?([^<"\n]+?)"?\s*(<|$)/im)?.[1]?.trim() ?? null;
  const lines = normalized.split("\n").filter((line) => !/^(from|to|date|subject|cc|bcc|sent):/i.test(line.trim())).map((line) => {
    const match = line.match(/^(?:\[[^\]]+\]\s*)?([^:]{1,60}):\s*(.+)$/);
    return match ? { speaker: match[1].replace(/\s*\(.*\)$/, "").trim(), text: match[2].trim() } : { speaker: sender, text: line.trim() };
  }).filter((line) => line.text && !/^(hi|hello|dear|thanks|regards|best)\b[^.!?]{0,30}[,!]?$/i.test(line.text));
  const buyer = lines.filter((line) => !line.speaker || !rep || !line.speaker.toLowerCase().startsWith(rep));
  let best = { text: buyer[0]?.text ?? normalized.slice(0, 200), speaker: buyer[0]?.speaker ?? null, category: "OTHER" as StallCategory, hits: 0 };
  for (const line of buyer) {
    for (const sentence of line.text.split(/(?<=[.!?])\s+/)) {
      const categories = categoriesForText(sentence);
      if (categories.length > best.hits) best = { text: sentence, speaker: line.speaker, category: categories[0], hits: categories.length };
    }
  }
  const speakers = [...new Set(buyer.map((line) => line.speaker).filter((s): s is string => Boolean(s)))].slice(0, 4);
  return {
    stall_category: best.category,
    stall_reason_summary: best.category === "OTHER" ? "Blocker unclear from the text; review and pick a category." : `Rules-based read: ${best.category.toLowerCase().replaceAll("_", " ")} blocker.`,
    evidence_quote: best.text.slice(0, 220), evidence_speaker: best.speaker, evidence_date: null,
    stated_timing: { text: null, resolved_date: null, event_trigger: null },
    competitor: { name: null, contract_end_date: null },
    missing_feature: { description: null, feature_key: null },
    stakeholders: speakers.map((name) => ({ name, title: null, role: "unknown" as const, sentiment: "neutral" as const })),
    commitments: [], buyer_sentiment: "neutral",
    language: /\b(hai|nahi|abhi|kar|ke|ko|toh|haan|accha)\b/i.test(normalized) ? "hinglish" : "en",
    confidence: best.category === "OTHER" ? 0.2 : 0.35,
  };
}

/**
 * Structured extraction via the smart model (cache first). Throws LlmOfflineMiss when offline and uncached
 * unless `mode: "rules"`; any other LLM failure falls back to rules with confidence ≤ 0.35.
 */
export async function extractMemory(normalized: string, ctx: ExtractionCtx, mode: "auto" | "rules" = "auto"): Promise<{ memory: ExtractedMemory; provenance: ExtractionProvenance; model?: string }> {
  if (mode === "rules") return { memory: finalizeExtraction(rulesExtraction(normalized, ctx), normalized, ctx.interactionDate), provenance: "rules" };
  const prompt = extractionPrompt({ ...ctx, interactionDate: isoDate(ctx.interactionDate), today: todayIso() }, normalized);
  try {
    const result = await callStructured({ tier: "smart", schema: MemoryExtraction, schemaName: "MemoryExtraction", ...prompt });
    return { memory: finalizeExtraction(result.data, normalized, ctx.interactionDate), provenance: result.provenance, model: result.model };
  } catch (error) {
    if (error instanceof LlmOfflineMiss) throw error;
    console.warn(`[capture] extraction failed, using rules: ${error instanceof Error ? error.message : error}`);
    return { memory: finalizeExtraction(rulesExtraction(normalized, ctx), normalized, ctx.interactionDate), provenance: "rules" };
  }
}

export function memoryView(memory: { stallCategory: string; summary: string; evidenceQuote: string; evidenceSpeaker: string | null; evidenceDate: Date | null; confidence: number; evidenceVerified: boolean; timingJson: string; competitorJson: string; stakeholdersJson: string; commitmentsJson: string; sentiment: string; language: string }) {
  return {
    stallCategory: memory.stallCategory, summary: memory.summary, evidenceQuote: memory.evidenceQuote, evidenceSpeaker: memory.evidenceSpeaker,
    evidenceDate: memory.evidenceDate?.toISOString() ?? null, confidence: memory.confidence, evidenceVerified: memory.evidenceVerified,
    timing: JSON.parse(memory.timingJson), competitor: JSON.parse(memory.competitorJson), stakeholders: JSON.parse(memory.stakeholdersJson),
    commitments: JSON.parse(memory.commitmentsJson), sentiment: memory.sentiment, language: memory.language,
  };
}

export function extractionView(memory: ExtractedMemory) {
  return {
    stallCategory: memory.stall_category, summary: memory.stall_reason_summary, evidenceQuote: memory.evidence_quote, evidenceSpeaker: memory.evidence_speaker,
    evidenceDate: memory.evidence_date, confidence: memory.confidence, evidenceVerified: memory.evidence_verified,
    timing: memory.stated_timing, competitor: memory.competitor, stakeholders: memory.stakeholders, commitments: memory.commitments,
    sentiment: memory.buyer_sentiment, language: memory.language,
  };
}

type Stakeholder = MemoryExtractionT["stakeholders"][number];
type Commitment = MemoryExtractionT["commitments"][number];

export function unionStakeholders(a: Stakeholder[], b: Stakeholder[]) {
  const map = new Map<string, Stakeholder>();
  for (const s of [...a, ...b]) map.set(s.name.trim().toLowerCase(), { ...map.get(s.name.trim().toLowerCase()), ...s });
  return [...map.values()].slice(0, 12);
}

export function unionCommitments(a: Commitment[], b: Commitment[]) {
  const map = new Map<string, Commitment>();
  for (const c of [...a, ...b]) map.set(`${c.by}:${c.text.trim().toLowerCase()}`, c);
  return [...map.values()].slice(0, 12);
}

export type CommitInput = { accountId: string; channel: Channel; text: string; edits?: { stallCategory?: StallCategory; summary?: string }; mode?: "auto" | "rules" };

export class CaptureError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

/** Saves a captured conversation: Interaction + merged Memory, then re-matches the deal (spec §6.4 step 4). */
export async function commitCapture(input: CommitInput) {
  const contentHash = hashContent(input.text);
  const existing = await db.interaction.findUnique({ where: { contentHash }, include: { deal: { include: { memory: true } } } });
  if (existing) {
    if (existing.deal.accountId !== input.accountId) throw new CaptureError("DUPLICATE_OTHER_ACCOUNT", "This conversation is already saved under a different account.", 409);
    return { alreadySaved: true, dealId: existing.dealId, accountId: existing.deal.accountId, memory: existing.deal.memory ? memoryView(existing.deal.memory) : null, lane: existing.deal.lane, laneChanges: [] as LaneChangeResult[], provenance: "cached" as ExtractionProvenance };
  }
  const { normalized, interactionDate } = normalizeConversation(input.text, input.channel);
  if (!normalized) throw new CaptureError("INVALID_WHATSAPP", "This does not look like a WhatsApp export. Try pasting it as text.");
  const ctx = await buildExtractionContext(input.accountId, input.channel, interactionDate);
  if (!ctx) throw new CaptureError("ACCOUNT_NOT_FOUND", "That account no longer exists.", 404);
  const { memory: extracted, provenance } = await extractMemory(normalized, ctx, input.mode ?? "auto");
  if (input.edits?.stallCategory) extracted.stall_category = input.edits.stallCategory;
  if (input.edits?.summary?.trim()) extracted.stall_reason_summary = input.edits.summary.trim().slice(0, 140);

  let deal = await db.deal.findFirst({ where: { accountId: input.accountId, stage: { notIn: ["won", "lost"] } }, include: { memory: true }, orderBy: { lastTouchAt: "desc" } });
  if (!deal) {
    const seller = await db.sellerProfile.findFirst();
    deal = await db.deal.create({ data: { id: `deal-${randomUUID()}`, accountId: input.accountId, ownerName: seller?.repName ?? "Ananya Rao", valueInr: 0, stage: "stalled", stalledAt: interactionDate, lastTouchAt: interactionDate, lane: "WATCH" }, include: { memory: true } });
  }
  const interactionId = `interaction-${randomUUID()}`;
  await db.interaction.create({ data: { id: interactionId, dealId: deal.id, channel: input.channel, occurredAt: interactionDate, rawText: input.text, normalizedText: normalized, contentHash } });

  const prior = deal.memory;
  const edited = Boolean(input.edits?.stallCategory || input.edits?.summary);
  const newerWins = !prior || edited || extracted.confidence >= prior.confidence;
  const evidenceDate = extracted.evidence_date ? new Date(`${extracted.evidence_date}T06:30:00Z`) : interactionDate;
  const stakeholders = unionStakeholders(prior ? JSON.parse(prior.stakeholdersJson) : [], extracted.stakeholders);
  const commitments = unionCommitments(prior ? JSON.parse(prior.commitmentsJson) : [], extracted.commitments);
  const pick = <T extends Record<string, unknown>>(next: T, previous: string | undefined): string => {
    const hasValue = Object.values(next).some((v) => v !== null && v !== undefined);
    if (newerWins && hasValue) return JSON.stringify(next);
    return previous ?? JSON.stringify(next);
  };
  const data = {
    timingJson: pick(extracted.stated_timing, prior?.timingJson),
    competitorJson: pick(extracted.competitor, prior?.competitorJson),
    missingFeatureJson: pick(extracted.missing_feature, prior?.missingFeatureJson),
    stakeholdersJson: JSON.stringify(stakeholders),
    commitmentsJson: JSON.stringify(commitments),
    ...(newerWins ? {
      stallCategory: extracted.stall_category, summary: extracted.stall_reason_summary, evidenceQuote: extracted.evidence_quote,
      evidenceSpeaker: extracted.evidence_speaker, evidenceDate, evidenceInteractionId: interactionId, evidenceVerified: extracted.evidence_verified,
      sentiment: extracted.buyer_sentiment, language: extracted.language, confidence: extracted.confidence, editedByUser: edited || (prior?.editedByUser ?? false),
    } : {}),
  };
  const memory = prior
    ? await db.memory.update({ where: { id: prior.id }, data })
    : await db.memory.create({ data: {
      id: `memory-${randomUUID()}`, dealId: deal.id, stallCategory: extracted.stall_category, summary: extracted.stall_reason_summary, evidenceQuote: extracted.evidence_quote,
      evidenceSpeaker: extracted.evidence_speaker, evidenceDate, evidenceInteractionId: interactionId, evidenceVerified: extracted.evidence_verified,
      sentiment: extracted.buyer_sentiment, language: extracted.language, confidence: extracted.confidence, editedByUser: edited, ...data,
    } });
  const lastTouchAt = deal.lastTouchAt && deal.lastTouchAt > interactionDate ? deal.lastTouchAt : interactionDate;
  await db.deal.update({ where: { id: deal.id }, data: { lastTouchAt } });
  await upsertComputedSignals([deal.id]);
  const laneChanges = await runMatcher({ dealIds: [deal.id] });
  void ingestDeal(deal.id).catch((error) => console.warn(`[capture] knowledge ingest failed: ${error instanceof Error ? error.message : error}`));
  const updated = await db.deal.findUnique({ where: { id: deal.id }, select: { lane: true } });
  return { alreadySaved: false, dealId: deal.id, accountId: input.accountId, memory: memoryView(memory), lane: updated?.lane ?? deal.lane, laneChanges, provenance, mergedIntoExisting: Boolean(prior), newerWins };
}

/** Preview without saving: cache-hit for already-saved conversations, else extraction (may throw LlmOfflineMiss). */
export async function previewCapture(input: { accountId: string; channel: Channel; text: string; mode?: "auto" | "rules" }) {
  const { normalized, interactionDate, truncated } = normalizeConversation(input.text, input.channel);
  if (!normalized) throw new CaptureError("INVALID_WHATSAPP", "This does not look like a WhatsApp export. Try pasting it as text.");
  const existing = await db.interaction.findUnique({ where: { contentHash: hashContent(input.text) }, include: { deal: { include: { memory: true } } } });
  if (existing && existing.deal.accountId === input.accountId && existing.deal.memory) {
    return { normalized, truncated, cached: true, alreadySaved: true, provenance: "cached" as ExtractionProvenance, lane: existing.deal.lane, memory: memoryView(existing.deal.memory) };
  }
  const ctx = await buildExtractionContext(input.accountId, input.channel, interactionDate);
  if (!ctx) throw new CaptureError("ACCOUNT_NOT_FOUND", "That account no longer exists.", 404);
  const { memory, provenance } = await extractMemory(normalized, ctx, input.mode ?? "auto");
  return { normalized, truncated, cached: provenance === "cached", alreadySaved: false, provenance, lane: null, memory: extractionView(memory) };
}
