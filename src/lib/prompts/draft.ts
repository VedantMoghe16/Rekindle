/** Draft prompt (spec §8.4). */

export type DraftPromptInput = {
  seller: { name: string; oneLiner: string };
  repName: string;
  contact: { name: string; title: string | null };
  channel: "whatsapp" | "email";
  language: "en" | "hinglish";
  memory: { quote: string; quoteDate: string | null; speaker: string | null; summary: string; stallCategory: string; timing: unknown; commitments: unknown; buyerLanguage: string };
  signals: { title: string; type: string; occurredAt: string }[];
  proofPoints: string[];
  followUpDays?: number | null;
};

export function draftSystemPrompt(repFirstName: string) {
  return `You write re-engagement messages for a B2B salesperson in India.
The buyer previously paused the deal. Something has changed. Write a short, human message
that proves we remember the conversation and makes a single low-friction ask.

Rules:
- Reference the earlier conversation specifically (month + what they said, paraphrased or a short quote of their exact words).
- Mention what changed naturally, as a person would ("Congrats on the Series B!"). Never say
  you "tracked", "monitored", "detected" or "scraped" anything, never mention "our system", and never write "we noticed you".
- If we owe them something (open commitment by "us"), deliver or offer it.
- Use exactly one proof point from the list provided, only if it is relevant to their blocker.
- Exactly one ask (e.g., a 20-minute call this week, or "should I send the updated plan?"). Use at most one question mark.
- Use only facts given. No invented numbers, customers or features.
- WhatsApp: ≤ 70 words, conversational, first name, at most one emoji. subject must be null.
- Email: ≤ 120 words, a specific subject line, no emojis, always English.
- Language: if asked for Hinglish on WhatsApp, write natural romanized Hinglish (mix of Hindi and English) as an Indian rep would; otherwise English.
- why_this_works: 1–2 short bullets for the rep.
- Sign off as ${repFirstName}.`;
}

export function draftUserPrompt(input: DraftPromptInput): string {
  const change = input.signals.length
    ? input.signals.map((s) => `- ${s.title} (${s.type}, ${s.occurredAt})`).join("\n")
    : `- No new external change. This is a follow-up after ${input.followUpDays ?? "several"} days of silence; keep it light and specific.`;
  return `SELLER: ${input.seller.name}: ${input.seller.oneLiner}
REP: ${input.repName}
CONTACT: ${input.contact.name}${input.contact.title ? `, ${input.contact.title}` : ""}
CHANNEL: ${input.channel}
LANGUAGE: ${input.language === "hinglish" && input.channel === "whatsapp" ? "Hinglish (romanized)" : "English"}
BUYER'S ORIGINAL LANGUAGE: ${input.memory.buyerLanguage}

MEMORY:
${JSON.stringify({ stall_category: input.memory.stallCategory, summary: input.memory.summary, exact_words: input.memory.quote, said_on: input.memory.quoteDate, speaker: input.memory.speaker, timing: input.memory.timing, commitments: input.memory.commitments }, null, 2)}

WHAT CHANGED:
${change}

PROOF POINTS (pick at most one):
${input.proofPoints.map((p) => `- ${p}`).join("\n") || "- (none)"}

Write the message.`;
}

export function draftRetrySuffix(violations: string[]): string {
  return `\n\nYour previous draft broke these rules. Fix all of them:\n${violations.map((v) => `- ${v}`).join("\n")}`;
}
