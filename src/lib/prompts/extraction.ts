/** Extraction prompt (spec §8.1 + India-specific rules from §7.1). */

export type ExtractionContext = {
  seller: { name: string; oneLiner: string };
  featureKeys: { key: string; description: string }[];
  accountName: string;
  contactName?: string | null;
  contactTitle?: string | null;
  repName?: string | null;
  channel: string;
  interactionDate: string;
  today: string;
};

export const EXTRACTION_SYSTEM = `You are Rekindle's sales-conversation analyst for B2B sales teams in India.
You read messy buyer conversations (email threads, WhatsApp chats, call transcripts)
in English, Hindi or Hinglish, and extract structured "revenue memory".

Rules:
- Be faithful. Extract only what is stated or clearly implied. Never invent names, dates, numbers or competitors.
- evidence_quote MUST be copied verbatim from the conversation (original language, original spelling), max 220 characters.
  Choose the single sentence or two that best shows WHY the deal stalled. Quote the buyer, not the seller.
- Keep quotes in the original language (Hindi/Hinglish stays romanized as written). The summary is in English.
- stall_category must be one of the allowed codes. If several apply, choose the one that is
  actually blocking the purchase right now.
- Dates: today's date and the conversation date are given. Resolve relative timing
  ("next quarter", "after Q3", "in January", "after Diwali", "after the festive season") to an ISO date (YYYY-MM-DD).
  Assume the Indian financial year (April–March) for "Q1–Q4" and "FY" unless calendar quarters are clear:
  Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar. "Next FY" means from 1 April.
  Resolved dates must not be earlier than the conversation date.
  If timing depends on an event (e.g., "after our round closes", "once we hire a security lead"),
  set resolved_date to null and set event_trigger to the matching signal type (FUNDING, HIRING_RELEVANT, ...).
- missing_feature.feature_key must be one of the provided feature keys, or null.
- commitments: "us" is the seller (the rep), "them" is the buyer. Mark done only if the conversation shows it happened.
- stakeholders: only people on the buyer side who appear in the conversation.
- confidence reflects how clearly the conversation states the blocker (0–1).
- Summaries are in English, concise, written for a busy salesperson (max 140 characters).`;

export function extractionUserPrompt(ctx: ExtractionContext, normalizedText: string): string {
  const keys = ctx.featureKeys.length ? ctx.featureKeys.map((f) => `- ${f.key}: ${f.description}`).join("\n") : "- (none)";
  const contact = ctx.contactName ? `${ctx.contactName}${ctx.contactTitle ? ` (${ctx.contactTitle})` : ""}` : "unknown";
  return `SELLER: ${ctx.seller.name}: ${ctx.seller.oneLiner}
SALES REP: ${ctx.repName ?? "unknown"}
KNOWN FEATURE KEYS:
${keys}
ACCOUNT: ${ctx.accountName}
PRIMARY CONTACT: ${contact}
CHANNEL: ${ctx.channel}
CONVERSATION DATE: ${ctx.interactionDate}
TODAY: ${ctx.today}

CONVERSATION:
"""
${normalizedText}
"""

Extract the revenue memory.`;
}

export function extractionPrompt(ctx: ExtractionContext, normalizedText: string) {
  return { system: EXTRACTION_SYSTEM, user: extractionUserPrompt(ctx, normalizedText) };
}
