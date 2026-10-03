import { db } from "@/lib/db";
import { cogneeAdd, cogneeCognify, cogneeSearch, isCogneeConfigured } from "@/lib/providers/cognee";
import { callStructured, isLlmAvailable } from "@/lib/providers/llm";
import { AskAnswer, type StallCategory } from "@/lib/schemas";
import { formatINR, formatShortDate } from "@/lib/format";

/* ---------- pure helpers (unit-tested) ---------- */

const STOPWORDS = new Set("a an the and or but of to in on at for with by from is are was were be been being it its this that these those what which who whom whose when where why how do does did done we us our you your they them their he she his her i me my all any some has have had will would can could should shall may might not no yes so than then there here into over about deals deal account accounts tell told say said".split(" "));

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

/** Fraction of distinct query tokens found in the document (prefix match for tokens ≥ 5 chars, so "implementation" ~ "implement"). */
export function lexicalScore(query: string, text: string): number {
  const queryTokens = [...new Set(tokenize(query))];
  if (!queryTokens.length) return 0;
  const docTokens = new Set(tokenize(text));
  const docList = [...docTokens];
  let hits = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) hits += 1;
    else if (token.length >= 5 && docList.some((doc) => doc.length >= 5 && (doc.startsWith(token.slice(0, 6)) || token.startsWith(doc.slice(0, 6))))) hits += 0.7;
  }
  return Number((hits / queryTokens.length).toFixed(3));
}

export const CATEGORY_KEYWORDS: Record<StallCategory, string[]> = {
  BUDGET: ["budget", "funding", "funds", "cash", "spend", "price", "pricing", "cost", "expensive", "money", "paisa", "allocation", "afford"],
  TIMING: ["timing", "later", "revisit", "quarter", "festive", "diwali", "postpone", "postponed", "park"],
  NO_OWNER: ["owner", "owning", "ownership", "nobody", "hire", "hiring", "headcount"],
  CHAMPION_LEFT: ["champion", "left", "moved on", "resigned", "departed"],
  COMPETITOR_LOCKIN: ["competitor", "competition", "contract", "locked", "lockin", "lock-in", "incumbent", "renewal", "vendor", "securegrid"],
  MISSING_FEATURE: ["feature", "missing", "mapping", "gap", "roadmap request", "support for", "iso"],
  IMPLEMENTATION_EFFORT: ["implementation", "implement", "onboarding", "onboard", "rollout", "setup", "set up", "effort", "integration", "integrate", "engineers", "plug and play", "heavy"],
  INTERNAL_APPROVAL: ["approval", "approve", "sign-off", "signoff", "board", "legal", "procurement", "cfo"],
  WENT_DARK: ["dark", "ghosted", "silent", "unresponsive", "stopped responding", "no reply", "no response"],
  OTHER: [],
};

function keywordHits(text: string, keyword: string): boolean {
  const lower = text.toLowerCase();
  if (keyword.includes(" ") || keyword.includes("-")) return lower.includes(keyword);
  const tokens = lower.split(/[^\p{L}\p{N}]+/u);
  return tokens.some((token) => token === keyword || (keyword.length >= 6 && token.startsWith(keyword.slice(0, Math.max(6, keyword.length - 3)))));
}

/** Stall categories a free-text question or sentence is about, strongest first. */
export function categoriesForText(text: string): StallCategory[] {
  const scored = (Object.entries(CATEGORY_KEYWORDS) as [StallCategory, string[]][])
    .map(([category, keywords]) => ({ category, hits: keywords.filter((keyword) => keywordHits(text, keyword)).length }))
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored.map(({ category }) => category);
}

export function isTemporalQuestion(question: string): boolean {
  return /\b(since|last|when|before|after|ago|recent|recently|timeline|date|dates|week|weeks|month|months|year|quarter|q[1-4]|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?|20\d\d)\b/i.test(question);
}

export type KnowledgeDoc = { id: string; kind: "interaction" | "memory" | "signal"; accountId: string; accountName: string; dealId: string | null; title: string; date: Date; text: string; quote?: string; valueInr?: number; stallCategory?: string };

export function rankDocuments(query: string, docs: KnowledgeDoc[], limit = 6) {
  return docs
    .map((doc) => ({ doc, score: lexicalScore(query, `${doc.title}\n${doc.text}`) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.doc.date.getTime() - a.doc.date.getTime())
    .slice(0, limit);
}

export function bestSnippet(query: string, text: string, max = 220): string {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  let best = lines[0] ?? "";
  let bestScore = -1;
  for (const line of lines) {
    const score = lexicalScore(query, line);
    if (score > bestScore) { best = line; bestScore = score; }
  }
  return best.length > max ? `${best.slice(0, max - 1)}…` : best;
}

const label = (category: string) => category.toLowerCase().replaceAll("_", " ");

/* ---------- documents ---------- */

const dateStr = (d: Date) => d.toISOString().slice(0, 10);

export async function buildDocuments(dealIds?: string[]): Promise<KnowledgeDoc[]> {
  const deals = await db.deal.findMany({
    where: dealIds ? { id: { in: dealIds } } : undefined,
    include: { account: { include: { signals: true } }, memory: true, interactions: true },
  });
  const docs: KnowledgeDoc[] = [];
  const seenSignals = new Set<string>();
  for (const deal of deals) {
    const accountName = deal.account.name;
    const dealName = `${accountName} deal (${formatINR(deal.valueInr)})`;
    for (const interaction of deal.interactions) {
      docs.push({
        id: `interaction:${interaction.id}`, kind: "interaction", accountId: deal.accountId, accountName, dealId: deal.id,
        title: `${accountName} · ${interaction.channel} · ${formatShortDate(interaction.occurredAt)}`, date: interaction.occurredAt,
        text: `# ${accountName} · ${dealName} · ${interaction.channel} · ${dateStr(interaction.occurredAt)}\n${interaction.normalizedText}`,
      });
    }
    const memory = deal.memory;
    if (memory) {
      const timing = JSON.parse(memory.timingJson) as { text?: string | null; resolved_date?: string | null; event_trigger?: string | null };
      const competitor = JSON.parse(memory.competitorJson) as { name?: string | null; contract_end_date?: string | null };
      const stakeholders = JSON.parse(memory.stakeholdersJson) as { name: string; title?: string | null; role?: string }[];
      const commitments = JSON.parse(memory.commitmentsJson) as { by: string; text: string; due_date?: string | null; done?: boolean }[];
      const evidenceDate = memory.evidenceDate ?? deal.stalledAt ?? deal.lastTouchAt ?? new Date(0);
      const lines = [
        `# Revenue memory · ${accountName} · ${dealName}`,
        `Stall category: ${memory.stallCategory} (${label(memory.stallCategory)})`,
        `Summary: ${memory.summary}`,
        `Evidence (${memory.evidenceSpeaker ?? "buyer"}, ${dateStr(evidenceDate)}): "${memory.evidenceQuote}"`,
        timing.text ? `Stated timing: ${timing.text}${timing.resolved_date ? ` → ${timing.resolved_date}` : ""}${timing.event_trigger ? ` (waits for ${timing.event_trigger})` : ""}` : "",
        competitor.name ? `Competitor: ${competitor.name}${competitor.contract_end_date ? ` until ${competitor.contract_end_date}` : ""}` : "",
        stakeholders.length ? `Stakeholders: ${stakeholders.map((s) => `${s.name}${s.title ? ` (${s.title})` : ""}${s.role ? ` [${s.role}]` : ""}`).join("; ")}` : "",
        commitments.length ? `Commitments: ${commitments.map((c) => `${c.by === "us" ? "We promised" : "They promised"}: ${c.text}${c.due_date ? ` by ${c.due_date}` : ""}${c.done ? " (done)" : ""}`).join("; ")}` : "",
        `Buyer sentiment: ${memory.sentiment}. Deal stage: ${deal.stage}. Lane: ${deal.lane}.`,
      ].filter(Boolean);
      docs.push({
        id: `memory:${deal.id}`, kind: "memory", accountId: deal.accountId, accountName, dealId: deal.id,
        title: `${accountName} · ${label(memory.stallCategory)}`, date: evidenceDate, text: lines.join("\n"),
        quote: memory.evidenceQuote, valueInr: deal.valueInr, stallCategory: memory.stallCategory,
      });
    }
    for (const signal of deal.account.signals) {
      if (seenSignals.has(signal.id) || (signal.dealId && signal.dealId !== deal.id)) continue;
      seenSignals.add(signal.id);
      docs.push({
        id: `signal:${signal.id}`, kind: "signal", accountId: deal.accountId, accountName, dealId: signal.dealId,
        title: signal.title, date: signal.occurredAt,
        text: `# Signal · ${accountName} · ${signal.type} · ${dateStr(signal.occurredAt)}\n${signal.title}${signal.detail && signal.detail !== signal.title ? `\n${signal.detail}` : ""}\nSource: ${signal.sourceName}${signal.sourceUrl ? ` ${signal.sourceUrl}` : ""} (${signal.provenance})`,
      });
    }
  }
  return docs;
}

const cogneeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");

export async function ingestDocuments(docs: KnowledgeDoc[]) {
  if (!isCogneeConfigured()) return { configured: false, documents: 0 };
  await cogneeAdd(docs.map((doc) => ({ id: cogneeId(doc.id), text: doc.text })));
  await cogneeCognify();
  return { configured: true, documents: docs.length };
}

export async function ingestAll() {
  if (!isCogneeConfigured()) return { configured: false, documents: 0 };
  return ingestDocuments(await buildDocuments());
}

export async function ingestDeal(dealId: string) {
  if (!isCogneeConfigured()) return { configured: false, documents: 0 };
  return ingestDocuments(await buildDocuments([dealId]));
}

/* ---------- ask ---------- */

export type Citation = { id: string; kind: KnowledgeDoc["kind"]; title: string; accountId: string; accountName: string; href: string; snippet: string };
export type AskResult = { answer: string; citations: Citation[]; provenance: "cognee" | "local" | "claude" };

function cite(doc: KnowledgeDoc, query: string): Citation {
  return { id: doc.id, kind: doc.kind, title: doc.title, accountId: doc.accountId, accountName: doc.accountName, href: `/accounts/${doc.accountId}`, snippet: doc.kind === "memory" && doc.quote ? `“${doc.quote}”` : bestSnippet(query, doc.text) };
}

async function scopedDocs(accountId?: string) {
  if (!accountId) return buildDocuments();
  const deals = await db.deal.findMany({ where: { accountId }, select: { id: true } });
  return buildDocuments(deals.map((deal) => deal.id));
}

export async function ask(question: string, accountId?: string): Promise<AskResult> {
  if (isCogneeConfigured()) {
    try {
      const scope = accountId ? (await db.account.findUnique({ where: { id: accountId }, select: { name: true } }))?.name : null;
      const query = scope ? `${question} (account: ${scope})` : question;
      const results = await cogneeSearch(query, isTemporalQuestion(question) ? "TEMPORAL" : "GRAPH_COMPLETION");
      const answer = results.filter(Boolean).join("\n\n").trim();
      if (answer) {
        const docs = await scopedDocs(accountId);
        const citations = rankDocuments(answer, docs, 12).filter(({ score }) => score >= 0.15).slice(0, 5).map(({ doc }) => cite(doc, question));
        return { answer, citations, provenance: "cognee" };
      }
    } catch (error) {
      console.warn(`[ask] Cognee search failed, using local search: ${error instanceof Error ? error.message : error}`);
    }
  }
  return localAnswer(question, accountId);
}

export async function localAnswer(question: string, accountId?: string): Promise<AskResult> {
  const docs = await scopedDocs(accountId);
  const memories = docs.filter((doc) => doc.kind === "memory");
  const categories = categoriesForText(question);
  let selected: KnowledgeDoc[];
  let template: string;

  const byCategory = categories.length ? memories.filter((doc) => doc.stallCategory && categories.includes(doc.stallCategory as StallCategory)) : [];
  if (byCategory.length) {
    selected = byCategory.sort((a, b) => (b.valueInr ?? 0) - (a.valueInr ?? 0));
    const total = selected.reduce((sum, doc) => sum + (doc.valueInr ?? 0), 0);
    const names = categories.filter((c) => selected.some((doc) => doc.stallCategory === c)).map(label).join(" / ");
    template = `${selected.length} deal${selected.length === 1 ? " is" : "s are"} blocked on ${names} (${formatINR(total)} in total):\n${selected.map((doc) => `• ${doc.accountName} (${formatINR(doc.valueInr ?? 0)}), ${formatShortDate(doc.date)}: “${doc.quote}”`).join("\n")}`;
  } else if (accountId) {
    const ranked = rankDocuments(question, docs, 6).map(({ doc }) => doc);
    selected = [...memories, ...ranked.filter((doc) => doc.kind !== "memory"), ...docs.filter((doc) => doc.kind !== "memory")].filter((doc, i, all) => all.findIndex((d) => d.id === doc.id) === i).slice(0, 6);
    const memory = memories[0];
    template = memory
      ? memory.text.split("\n").slice(1).filter((line) => !line.startsWith("Buyer sentiment")).join("\n")
      : selected.length ? `What we have on file:\n${selected.map((doc) => `• ${doc.title}: ${bestSnippet(question, doc.text, 160)}`).join("\n")}` : "Nothing has been captured for this account yet. Add a conversation on Capture.";
  } else {
    selected = rankDocuments(question, docs, 6).map(({ doc }) => doc);
    template = selected.length
      ? `Closest matches in the pipeline:\n${selected.map((doc) => `• ${doc.title}: ${doc.kind === "memory" && doc.quote ? `“${doc.quote}”` : bestSnippet(question, doc.text, 160)}`).join("\n")}`
      : "Nothing in the pipeline memory matches that question yet. Try naming an account, a blocker (budget, implementation, competitor) or a signal.";
  }

  if (selected.length && isLlmAvailable()) {
    try {
      const context = selected.slice(0, 8).map((doc) => `[${doc.id}]\n${doc.text.slice(0, 1500)}`).join("\n\n---\n\n");
      const { data } = await callStructured({
        tier: "fast", schema: AskAnswer, schemaName: "AskAnswer",
        system: "You answer a sales team's questions about their pipeline using ONLY the provided documents. Be concise (max 120 words), name accounts, quote buyers' exact words where useful, include ₹ values when given. cited_ids must be ids of documents you used, exactly as written in brackets.",
        user: `QUESTION: ${question}\n\nDOCUMENTS:\n${context}`,
      });
      const cited = data.cited_ids.map((id) => selected.find((doc) => doc.id === id)).filter((doc): doc is KnowledgeDoc => Boolean(doc));
      return { answer: data.answer, citations: (cited.length ? cited : selected).slice(0, 6).map((doc) => cite(doc, question)), provenance: "claude" };
    } catch (error) {
      console.warn(`[ask] Claude synthesis failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  return { answer: template, citations: selected.slice(0, 6).map((doc) => cite(doc, question)), provenance: "local" };
}
