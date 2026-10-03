import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { callStructured, defaultProvider, isProviderConfigured, type LlmProvider } from "@/lib/providers/llm";
import { DraftOutput } from "@/lib/schemas";
import { templateDraft, validateDraft, type DraftChannel, type DraftLanguage } from "@/lib/engines/draft-rules";
import { draftRetrySuffix, draftSystemPrompt, draftUserPrompt } from "@/lib/prompts/draft";

export type DraftProvenance = "claude" | "sarvam" | "cached" | "template";
export class DraftError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }

const DAY = 86_400_000;

function pickProofPoint(points: string[], category: string): string | null {
  const prefer: Record<string, RegExp> = { IMPLEMENTATION_EFFORT: /onboard|connector|days/i, MISSING_FEATURE: /iso|mapping/i, NO_OWNER: /onboard|connector/i, COMPETITOR_LOCKIN: /connector|onboard/i };
  return points.find((p) => prefer[category]?.test(p)) ?? points[0] ?? null;
}

export function draftView(draft: { id: string; channel: string; language: string; subject: string | null; body: string; whyJson: string; provenance: string; createdAt: Date }) {
  return { id: draft.id, channel: draft.channel, language: draft.language, subject: draft.subject, body: draft.body, why: JSON.parse(draft.whyJson) as string[], provenance: draft.provenance, createdAt: draft.createdAt.toISOString() };
}

export async function generateDraft(recommendationId: string, channel: DraftChannel, language: DraftLanguage) {
  const rec = await db.recommendation.findUnique({ where: { id: recommendationId }, include: { deal: { include: { account: { include: { contacts: true, signals: true } }, memory: true } } } });
  if (!rec) throw new DraftError("NOT_FOUND", "That recommendation no longer exists.", 404);
  const { deal } = rec;
  const memory = deal.memory;
  const seller = await db.sellerProfile.findFirst();
  const repName = seller?.repName ?? deal.ownerName;
  const contact = deal.account.contacts.find((c) => c.role === "champion" || c.role === "decision_maker") ?? deal.account.contacts[0];
  const signalIds = JSON.parse(rec.signalIdsJson) as string[];
  const signals = deal.account.signals.filter((s) => signalIds.includes(s.id));
  const proofPoints = seller ? JSON.parse(seller.proofPointsJson) as string[] : [];
  const category = memory?.stallCategory ?? "OTHER";
  const quoteDate = memory?.evidenceDate ?? deal.stalledAt ?? deal.lastTouchAt;
  const followUpDays = deal.lastTouchAt ? Math.floor((now().getTime() - deal.lastTouchAt.getTime()) / DAY) : null;
  const lang: DraftLanguage = channel === "email" ? "en" : language;

  let result: { subject: string | null; body: string; why: string[]; provenance: DraftProvenance } | null = null;
  const provider: LlmProvider = lang === "hinglish" && process.env.SARVAM_DRAFTS === "true" && isProviderConfigured("sarvam") ? "sarvam" : defaultProvider();
  const system = draftSystemPrompt(repName.split(" ")[0]);
  const user = draftUserPrompt({
    seller: { name: seller?.name ?? "", oneLiner: seller?.oneLiner ?? "" }, repName,
    contact: { name: contact?.name ?? "there", title: contact?.title ?? null }, channel, language: lang,
    memory: {
      quote: memory?.evidenceQuote ?? "", quoteDate: quoteDate?.toISOString().slice(0, 10) ?? null, speaker: memory?.evidenceSpeaker ?? null,
      summary: memory?.summary ?? "", stallCategory: category, timing: memory ? JSON.parse(memory.timingJson) : null,
      commitments: memory ? JSON.parse(memory.commitmentsJson) : [], buyerLanguage: memory?.language ?? "en",
    },
    signals: signals.map((s) => ({ title: s.title, type: s.type, occurredAt: s.occurredAt.toISOString().slice(0, 10) })),
    proofPoints, followUpDays: signals.length ? null : followUpDays,
  });
  let prompt = user;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    try {
      const response = await callStructured({ tier: "smart", provider, schema: DraftOutput, schemaName: "DraftOutput", system, user: prompt, maxTokens: 2000 });
      const violations = validateDraft(response.data.body, channel);
      if (violations.length) { prompt = user + draftRetrySuffix(violations); continue; }
      result = {
        subject: channel === "email" ? response.data.subject : null, body: response.data.body.trim(), why: response.data.why_this_works.slice(0, 3),
        provenance: response.provenance === "cached" ? "cached" : provider === "sarvam" ? "sarvam" : "claude",
      };
    } catch (error) {
      if (!(error instanceof Error && error.name === "LlmOfflineMiss")) console.warn(`[drafts] LLM draft failed: ${error instanceof Error ? error.message : error}`);
      break;
    }
  }
  if (!result) {
    const fallback = templateDraft({ channel, contactFirstName: contact?.name ?? "there", repName, quote: memory?.evidenceQuote ?? null, quoteDate, signalTitle: signals[0]?.title ?? null, proofPoint: pickProofPoint(proofPoints, category), language: lang });
    result = { subject: fallback.subject, body: fallback.body, why: fallback.why_this_works, provenance: "template" };
  }
  const draft = await db.draft.create({ data: { recommendationId: rec.id, channel, language: lang, subject: result.subject, body: result.body, whyJson: JSON.stringify(result.why), provenance: result.provenance } });
  if (rec.status !== "sent") await db.recommendation.update({ where: { id: rec.id }, data: { status: "drafted" } });
  await db.outcome.create({ data: { dealId: deal.id, recommendationId: rec.id, stallCategory: category, signalType: signals[0]?.type ?? null, event: "drafted", occurredAt: now() } });
  return { ...draftView(draft), violations: validateDraft(draft.body, channel) };
}

export async function updateRecommendation(id: string, input: { action: "snooze" | "dismiss" | "sent"; draftId?: string; body?: string }) {
  const rec = await db.recommendation.findUnique({ where: { id }, include: { deal: { include: { memory: true, account: { include: { signals: true } } } } } });
  if (!rec) throw new DraftError("NOT_FOUND", "That recommendation no longer exists.", 404);
  const today = now();
  if (input.action === "snooze") {
    return db.recommendation.update({ where: { id }, data: { status: "snoozed", snoozedUntil: new Date(today.getTime() + 7 * DAY) } });
  }
  if (input.action === "dismiss") {
    return db.recommendation.update({ where: { id }, data: { status: "dismissed", snoozedUntil: null } });
  }
  if (input.draftId && input.body?.trim()) {
    await db.draft.updateMany({ where: { id: input.draftId, recommendationId: id }, data: { body: input.body.trim() } });
  }
  const signalId = (JSON.parse(rec.signalIdsJson) as string[])[0];
  const signal = rec.deal.account.signals.find((s) => s.id === signalId);
  await db.outcome.create({ data: { dealId: rec.dealId, recommendationId: id, stallCategory: rec.deal.memory?.stallCategory ?? "OTHER", signalType: signal?.type ?? null, event: "sent", occurredAt: today } });
  await db.deal.update({ where: { id: rec.dealId }, data: { lastTouchAt: today, stage: "revived" } });
  return db.recommendation.update({ where: { id }, data: { status: "sent", snoozedUntil: null } });
}

/** A follow-up recommendation for a cold deal that has no current recommendation. */
export async function ensureNudgeRecommendation(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { recommendations: { where: { isCurrent: true } } } });
  if (!deal) throw new DraftError("NOT_FOUND", "That deal no longer exists.", 404);
  if (deal.recommendations[0]) return deal.recommendations[0];
  const days = deal.lastTouchAt ? Math.floor((now().getTime() - deal.lastTouchAt.getTime()) / DAY) : 0;
  return db.recommendation.create({ data: {
    id: `rec-${randomUUID()}`, dealId, signalIdsJson: "[]", effect: "NEUTRAL", matchScore: deal.matchScore, priorityScore: deal.priorityScore, lane: deal.lane,
    headline: `Follow up: ${days} days silent`, explanation: "No new signal yet. A short, specific check-in keeps the conversation alive.",
    scoreBreakdownJson: JSON.stringify({ match: deal.matchScore, followUpDays: days }),
  } });
}
