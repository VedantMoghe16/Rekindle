import { choosePlays } from "@/lib/vyapar/counter";
import { classifyReply, type ReplyUnderstanding } from "@/lib/vyapar/replies";
import { PLAY_OUTCOMES } from "@/lib/vyapar/growth";
import { OBJECTION_LABELS, rupees, type Objection, type SellerOffers } from "@/lib/vyapar/taxonomy";

/**
 * Pure helpers behind the Sarvam agent's mid-call tools. No LLM, no network: answers in milliseconds,
 * from the seller's real offer sheet and what we already know about the buyer.
 */

const TOOL_OBJECTION: Record<string, Objection> = {
  price: "PRICE_TOO_HIGH", moq: "BULK_ONLY_MOQ", quality: "QUALITY_DOUBT", timing: "NOT_NOW", existing_supplier: "HAS_SUPPLIER",
  credit: "CREDIT_TERMS", delivery: "DELIVERY_RELIABILITY", other: "OTHER",
};

/** "price, existing_supplier" / "PRICE_TOO_HIGH" / "too expensive" → objection codes, most important first. */
export function parseObjections(raw: string | undefined | null): Objection[] {
  if (!raw) return [];
  const parts = raw.toLowerCase().split(/[,;|/]+|\band\b/).map((p) => p.trim()).filter(Boolean);
  const out: Objection[] = [];
  for (const p of parts) {
    const key = p.replace(/[\s-]+/g, "_");
    const hit = TOOL_OBJECTION[key] ?? (Object.keys(OBJECTION_LABELS).includes(key.toUpperCase()) ? (key.toUpperCase() as Objection) : classifyReply(p).objection);
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/** The buyer's last turn from a Sarvam transcript (string or [{role, en_text}] JSON). */
export function lastBuyerTurn(transcript: unknown): string {
  if (!transcript) return "";
  if (typeof transcript === "string") {
    try { return lastBuyerTurn(JSON.parse(transcript)); } catch { /* plain text */ }
    const lines = transcript.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const user = lines.filter((l) => /^(user|customer|caller|buyer)\s*:/i.test(l));
    return (user.at(-1) ?? lines.at(-1) ?? "").replace(/^[a-z]+\s*:\s*/i, "");
  }
  if (Array.isArray(transcript)) {
    const turns = transcript as { role?: string; en_text?: string; text?: string; content?: string }[];
    const user = turns.filter((t) => !/agent|bot|assistant/i.test(t.role ?? ""));
    const t = user.at(-1);
    return t?.en_text ?? t?.text ?? t?.content ?? "";
  }
  return "";
}

export function truncateWords(text: string, max = 25): string {
  // Spoken by the voice agent: drop emoji, keep plain words.
  const words = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").replace(/\s+/g, " ").trim().split(" ");
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ").replace(/[,;:]$/, "")}…`;
}

/** Real price for a quantity from the seller's tiers. Never invents a number. */
export function quote(offers: SellerOffers, qty: number, sku?: string | null) {
  const item = offers.catalog.find((c) => c.sku === sku) ?? offers.catalog.find((c) => /bag/i.test(c.name)) ?? offers.catalog[0];
  const isBag = /bag/i.test(item.name);
  const tier = isBag ? [...offers.tiers].filter((t) => qty >= t.minQty).sort((a, b) => a.unitPriceInr - b.unitPriceInr)[0] : undefined;
  const unit = tier ? Math.min(tier.unitPriceInr, item.unitPriceInr) : item.unitPriceInr;
  const total = Math.round(unit * qty * 100) / 100;
  const noun = isBag ? "bags" : /box/i.test(item.name) ? "boxes" : "pcs";
  const belowMoq = qty < offers.moq;
  const next = isBag ? [...offers.tiers].filter((t) => t.minQty > qty).sort((a, b) => a.minQty - b.minQty)[0] : undefined;
  const say = `${qty.toLocaleString("en-IN")} ${noun} = ${rupees(total)} (${rupees(unit)} per ${noun.replace(/s$/, "").replace(/boxe$/, "box")})${belowMoq ? `. Minimum order ${offers.moq}` : next ? `. ${next.minQty.toLocaleString("en-IN")}+ pe ${rupees(next.unitPriceInr)} ho jaata hai` : ""}.`;
  return { sku: item.sku, product: item.name, qty, unitPriceInr: unit, totalInr: total, belowMoq, say };
}

/** First number in free text: "1000 bags", "do hazaar", "1,500". */
export function parseQty(raw: unknown): number | null {
  if (typeof raw === "number" && raw > 0) return Math.round(raw);
  const text = String(raw ?? "").toLowerCase();
  const digits = text.match(/(\d[\d,]*)/);
  if (digits) return Number(digits[1].replace(/,/g, ""));
  const words: Record<string, number> = { "ek hazaar": 1000, "do hazaar": 2000, "teen hazaar": 3000, "paanch sau": 500, "ek sau": 100, thousand: 1000, hazaar: 1000 };
  for (const [w, n] of Object.entries(words)) if (text.includes(w)) return n;
  return null;
}

/** One-line offer sheet for the agent's context: every price, tier, MOQ, sample and delivery rule. */
export function offerSheet(offers: SellerOffers): string {
  const tier = offers.tiers[0];
  return [
    ...offers.catalog.map((c) => `${c.name} ${rupees(c.unitPriceInr)}${/bag/i.test(c.name) && tier ? ` (${tier.minQty.toLocaleString("en-IN")}+: ${rupees(tier.unitPriceInr)})` : ""}`),
    `Minimum order ${offers.moq} pcs`,
    offers.freeSample.enabled ? `Free sample: ${offers.freeSample.contents}` : "No free samples",
    `Same-day delivery within ${offers.deliveryRadiusKm} km if ordered by ${offers.sameDayCutoff}`,
    offers.credit.viaPaytmPostpaid ? `${offers.credit.days}-day credit via Paytm Postpaid` : `${offers.credit.days}-day credit`,
  ].join("; ");
}

/** Lessons the agent should apply, from the play history (demo benchmark) ranked by win rate. */
export function lessons(): string[] {
  return [...PLAY_OUTCOMES].sort((a, b) => b.sample / b.tried - a.sample / a.tried).map((o) => `${OBJECTION_LABELS[o.objection as Objection]} → ${o.play} works best (${Math.round((o.sample / o.tried) * 100)}% took a sample, demo benchmark)`);
}

/** Counter for the objection(s): uses the play ranking (win rates) and known facts such as the competitor's price. */
export function counterFor(input: { objections: Objection[]; buyerText: string; buyerFirstName: string; sellerFirstName: string; offers: SellerOffers; competitorPriceInr?: number | null }) {
  const base = classifyReply(input.buyerText || "rate zyada hai");
  const primary = input.objections[0] ?? base.objection ?? "OTHER";
  const understanding: ReplyUnderstanding = { ...base, intent: "OBJECTION", objection: primary, secondaryObjection: input.objections[1] ?? base.secondaryObjection, competitorPriceInr: base.competitorPriceInr ?? input.competitorPriceInr ?? null };
  const plays = choosePlays(understanding);
  const play = plays[0];
  const text = play.render({ buyerFirstName: input.buyerFirstName, sellerFirstName: input.sellerFirstName, offers: input.offers, understanding });
  const second = input.objections[1] && input.objections[1] !== primary ? input.objections[1] : null;
  return { objection: primary, play: play.id, label: play.label, winRate: play.winRate, say: truncateWords(text, 25), followUpFor: second, alternatives: plays.slice(1, 3).map((p) => p.label) };
}

/** Top 3 plays for a buyer given what they objected to before (or the default opening plays). */
export function topPlays(pastObjections: Objection[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of [...pastObjections, "PRICE_TOO_HIGH", "QUALITY_DOUBT", "HAS_SUPPLIER"] as Objection[]) {
    const p = choosePlays({ intent: "OBJECTION", objection: o, secondaryObjection: null, quote: "", summary: "", askedPriceInr: null, competitorPriceInr: null, timing: null, language: "hinglish" })[0];
    if (!seen.has(p.id)) { seen.add(p.id); out.push(`${OBJECTION_LABELS[o]} → ${p.label} (${p.winRate}%)`); }
    if (out.length === 3) break;
  }
  return out;
}
