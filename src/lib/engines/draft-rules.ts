/** Draft guardrails (spec §7.6) and a deterministic template that always passes them. */

export type DraftChannel = "whatsapp" | "email";
export type DraftLanguage = "en" | "hinglish";

export const WORD_LIMITS: Record<DraftChannel, number> = { whatsapp: 70, email: 120 };
export const BANNED = /detected|tracked|monitor(ed|ing)|our system|we noticed you|scraped/i;

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function validateDraft(body: string, channel: DraftChannel): string[] {
  const violations: string[] = [];
  const words = wordCount(body);
  if (!body.trim()) violations.push("The message is empty.");
  if (words > WORD_LIMITS[channel]) violations.push(`${channel === "whatsapp" ? "WhatsApp" : "Email"} must be at most ${WORD_LIMITS[channel]} words (currently ${words}).`);
  const banned = body.match(BANNED);
  if (banned) violations.push(`Remove surveillance language ("${banned[0]}").`);
  const questions = (body.match(/\?/g) ?? []).length;
  if (questions > 1) violations.push(`Use exactly one ask: at most one question mark (found ${questions}).`);
  return violations;
}

export type TemplateInput = {
  channel: DraftChannel;
  contactFirstName: string;
  repName: string;
  quote: string | null;
  quoteDate: Date | string | null;
  signalTitle: string | null;
  proofPoint: string | null;
  language?: DraftLanguage;
};

export type TemplateDraft = { subject: string | null; body: string; why_this_works: string[] };

function monthName(value: Date | string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long" }).format(date);
}

function clean(text: string | null, maxWords: number): string | null {
  if (!text) return null;
  const safe = text.replace(/\?/g, "").replace(/["“”]/g, "'").replace(/\s+/g, " ").trim().replace(/[.,;:!]+$/, "");
  if (!safe || BANNED.test(safe)) return null;
  const words = safe.split(" ");
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : safe;
}

function compose(input: TemplateInput, quoteWords: number, detailWords: number): TemplateDraft {
  const first = input.contactFirstName.trim().split(/\s+/)[0] || "there";
  const rep = input.repName.trim().split(/\s+/)[0] || "Ananya";
  const month = monthName(input.quoteDate);
  const quote = clean(input.quote, quoteWords);
  const change = clean(input.signalTitle, detailWords);
  const proof = clean(input.proofPoint, detailWords);
  const when = month ? `in ${month}` : "last time";
  const recall = quote ? `When we spoke ${when}, you said "${quote}".` : `It has been a while since we spoke ${when}.`;
  const changeLine = change ? `A lot has moved since then (${change}), so it felt like the right time to reconnect.` : "Wanted to check in, since it has been a while.";
  const proofLine = proof ? `One thing that may help: ${proof.charAt(0).toLowerCase()}${proof.slice(1)}.` : "";
  const why = [
    quote ? `References their own words from ${month ?? "the last conversation"}, so it reads as a continuation, not a cold pitch.` : "Picks up the earlier thread instead of starting a cold pitch.",
    change ? "Connects what changed to their original blocker and makes one low-friction ask." : "Makes one low-friction ask without pressure.",
  ];
  if (input.channel === "whatsapp") {
    const greeting = input.language === "hinglish" ? `Hi ${first}, umeed hai sab badhiya chal raha hai.` : `Hi ${first}!`;
    const body = [greeting, recall, changeLine, proofLine, "Worth a quick 15-minute call this week?", `- ${rep}`].filter(Boolean).join(" ");
    return { subject: null, body, why_this_works: why };
  }
  const subject = month ? `Picking up from our ${month} conversation` : "Picking up where we left off";
  const body = [`Hi ${first},`, `${recall} ${changeLine}`, proofLine, "Would a 20-minute call next week be useful?", `Best,\n${rep}`].filter(Boolean).join("\n\n");
  return { subject, body, why_this_works: why };
}

/** Deterministic fallback draft. Shrinks quoted material until the draft passes validateDraft. */
export function templateDraft(input: TemplateInput): TemplateDraft {
  for (const [quoteWords, detailWords] of [[18, 14], [12, 10], [8, 8], [5, 6], [3, 4]] as const) {
    const draft = compose(input, quoteWords, detailWords);
    if (validateDraft(draft.body, input.channel).length === 0) return draft;
  }
  return compose({ ...input, quote: null, signalTitle: null, proofPoint: null }, 0, 0);
}
