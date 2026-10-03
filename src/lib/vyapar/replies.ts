import { z } from "zod";
import { Objection, ReplyIntent } from "@/lib/vyapar/taxonomy";

export const ReplyUnderstanding = z.object({
  intent: ReplyIntent,
  objection: Objection.nullable(),
  secondaryObjection: Objection.nullable(),
  quote: z.string().max(240),
  summary: z.string().max(160),
  askedPriceInr: z.number().nullable(),
  competitorPriceInr: z.number().nullable(),
  timing: z.string().max(120).nullable(),
  language: z.enum(["hinglish", "hindi", "english"]),
});
export type ReplyUnderstanding = z.infer<typeof ReplyUnderstanding>;

const RULES: [Objection, RegExp][] = [
  ["CREDIT_TERMS", /\b(credit|udhaa?r|baad mein payment|payment baad|\d+\s*din (ka|ki)? ?(credit|time))\b/],
  ["PRICE_TOO_HIGH", /\b(rate|price|daam|bhav|meh[ae]nga|costly|expensive|zyada hai|jyada hai|sasta|kam karo|discount|kam mein|mein milega)\b/],
  ["HAS_SUPPLIER", /\b(supplier|pehle se|already|wale se|wala deta|regular wala|le rahe hain)\b/],
  ["BULK_ONLY_MOQ", /\b(minimum|moq|chhota order|thoda hi|kam quantity|itna nahi chahiye)\b/],
  ["QUALITY_DOUBT", /\b(quality|phat|leak|kamzor|strong hai|tikau|grease)\b/],
  ["DELIVERY_RELIABILITY", /\b(delivery|time pe|late|pahunchega|pahuchega)\b/],
  ["NOT_NOW", /\b(baad mein|abhi nahi|next month|agle mahine|diwali ke baad|busy hai|busy hoon)\b/],
  ["OWNER_UNAVAILABLE", /\b(malik|owner|bahar gaye|sir nahi|bhaiya nahi hai)\b/],
];

const NOT_INTERESTED = /\b(nahi chahiye|not interested|mat bhejo|band karo|no thanks|zaroo?rat nahi|interest nahi)\b/;
const SAMPLE = /\bsample\b.*\b(bhejo|bhej do|bhejiye|send|chahiye|de do|dikhao|bhijwa)\b|\b(bhejo|bhej do|send)\b.*\bsample\b/;
const MEETING = /\b(milte hain|meet|milo|mil lo|aa jao|aaiye|aao|visit|call karo|baat karte)\b/;
const ORDER = /\b(order (kar|confirm|de)|(\d{2,5})\s*(pcs|pieces|piece|bags|boxes)\s*(bhej|chahiye|de do)|final karo|done karo|pakka)\b/;
const POSITIVE = /\b(achha|accha|haan|ha ji|theek|thik|ok|okay|interested|batao|details|price list|rate list)\b/;

/** Deterministic Hinglish reply understanding. The LLM path returns the same shape; this is the fallback and the test oracle. */
export function classifyReply(raw: string): ReplyUnderstanding {
  const text = raw.toLowerCase();
  const prices = [...raw.matchAll(/(?:₹|rs\.?\s*)\s*(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1]));
  const hits = RULES.filter(([, re]) => re.test(text)).map(([o]) => o);
  const supplierPrice = /(supplier|wale|wala|abhi)/.test(text) && prices.length > 1 ? prices[1] : /(supplier|wale se|wala)/.test(text) && prices.length === 1 && !/milega|kar do|karo/.test(text) ? prices[0] : null;

  let intent: ReplyUnderstanding["intent"];
  if (NOT_INTERESTED.test(text)) intent = "NOT_INTERESTED";
  else if (ORDER.test(text)) intent = "PLACES_ORDER";
  else if (SAMPLE.test(text)) intent = "WANTS_SAMPLE";
  else if (MEETING.test(text)) intent = "WANTS_MEETING";
  else if (hits.length) intent = "OBJECTION";
  else if (text.includes("?")) intent = "QUESTION";
  else if (POSITIVE.test(text)) intent = "INTERESTED";
  else intent = "QUESTION";

  const objection = intent === "NOT_INTERESTED" ? "NOT_INTERESTED" : intent === "OBJECTION" ? hits[0] : null;
  const secondary = intent === "OBJECTION" ? hits.find((h) => h !== objection) ?? null : null;
  const quote = quoteFor(raw, objection ? RULES.find(([o]) => o === objection)?.[1] : intent === "WANTS_SAMPLE" ? /sample/i : null);

  return {
    intent,
    objection,
    secondaryObjection: secondary,
    quote,
    summary: summarise(intent, objection, prices[0] ?? null, supplierPrice),
    askedPriceInr: intent === "OBJECTION" && objection === "PRICE_TOO_HIGH" && prices.length ? prices[0] : null,
    competitorPriceInr: supplierPrice,
    timing: timingFor(text),
    language: /[ऀ-ॿ]/.test(raw) ? "hindi" : /\b(hai|nahi|mein|bhejo|kar|ji|bhaiya|theek|kya|aap)\b/.test(text) ? "hinglish" : "english",
  };
}

/** The verbatim sentence that carries the signal, so memory can cite exactly what the buyer said. */
export function quoteFor(raw: string, re: RegExp | null | undefined): string {
  const sentences = raw.split(/(?<=[.?!।])\s+/).map((s) => s.trim()).filter(Boolean);
  const match = re ? sentences.find((s) => new RegExp(re.source, "i").test(s.toLowerCase())) : null;
  return (match ?? sentences[0] ?? raw).slice(0, 240);
}

function timingFor(text: string): string | null {
  const monthly = text.match(/har mahine\s*(\d{1,2})\s*(?:tareekh|tarikh|date)/);
  if (monthly) return `Restocks monthly on the ${ordinal(Number(monthly[1]))}`;
  const date = text.match(/(\d{1,2})\s*(?:tareekh|tarikh)/);
  if (date) return `Mentioned the ${ordinal(Number(date[1]))}`;
  const time = text.match(/\b(kal|tomorrow)\b[^.]*?(\d{1,2})\s*baje/);
  if (time) return `Available tomorrow at ${time[2]}:00`;
  if (/diwali ke baad/.test(text)) return "After Diwali";
  if (/agle mahine|next month/.test(text)) return "Next month";
  return null;
}

function summarise(intent: string, objection: string | null, price: number | null, supplier: number | null): string {
  switch (intent) {
    case "OBJECTION":
      if (objection === "PRICE_TOO_HIGH") return `Says price is too high${price ? `, asked for ₹${price}` : ""}${supplier ? `; current supplier ₹${supplier}` : ""}`;
      if (objection === "HAS_SUPPLIER") return `Already buys from another supplier${supplier ? ` at ₹${supplier}` : ""}`;
      if (objection === "CREDIT_TERMS") return "Wants to pay later (credit terms)";
      return `Raised: ${objection?.toLowerCase().replace(/_/g, " ")}`;
    case "WANTS_SAMPLE": return "Agreed to try a free sample";
    case "WANTS_MEETING": return "Wants to meet or talk";
    case "PLACES_ORDER": return "Ready to place an order";
    case "NOT_INTERESTED": return "Not interested right now";
    case "INTERESTED": return "Interested, wants details";
    default: return "Asked a question";
  }
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
