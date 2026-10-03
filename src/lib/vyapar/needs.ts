import { z } from "zod";

/**
 * Buyer needs → feasible supplier offers (VYAPAR_BUYER_NEEDS_IMPLEMENTATION_PLAN.md, Release A, simplified).
 * A buyer states a need; we show at most three offers that can actually meet it; the buyer picks who may contact them.
 * Pure functions only: the server layer loads data and persists choices.
 */

export const PRODUCTS = {
  pastry_box: { label: "Pastry box", unit: "box", words: ["pastry box", "pastry boxes", "cake box", "cake boxes", "bakery box", "bakery boxes"] },
  paper_bag: { label: "Paper bag", unit: "bag", words: ["paper bag", "paper bags", "carry bag", "carry bags", "kraft bag", "kraft bags"] },
  food_container: { label: "Food container", unit: "container", words: ["food container", "food containers", "food box", "food boxes", "takeaway box", "takeaway boxes", "container", "containers", "meal box"] },
} as const;
export type ProductKey = keyof typeof PRODUCTS;
export const PRODUCT_KEYS = Object.keys(PRODUCTS) as ProductKey[];

export const NeedDraft = z.object({
  productKey: z.enum(["pastry_box", "paper_bag", "food_container"]).nullable(),
  quantity: z.number().int().positive().nullable(),
  maxUnitPriceInr: z.number().positive().nullable(),
  neededBy: z.string().nullable().describe("ISO date (YYYY-MM-DD) in India time, or null when not stated"),
  sampleFirst: z.boolean(),
  backupSupplier: z.boolean().describe("true when the buyer already has a supplier and wants a backup or trial"),
});
export type NeedDraft = z.infer<typeof NeedDraft>;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const HINDI_DAYS: Record<string, number> = { ravivar: 0, somvar: 1, mangalvar: 2, budhvar: 3, guruvar: 4, shukravar: 5, shanivar: 6 };

/** YYYY-MM-DD of `now` in India time. */
export function istDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + days);
  return istDate(d);
}

/** Deterministic parser (English + Hinglish). Unknown stays null; it is never guessed. */
export function parseNeed(raw: string, now: Date): NeedDraft {
  const text = raw.toLowerCase();
  const productKey = PRODUCT_KEYS.find((k) => PRODUCTS[k].words.some((w) => text.includes(w))) ?? null;
  const qty = text.match(/(\d[\d,]*)\s*(?:pcs|pieces|nos|units|x)?\s+(?:[a-z-]+\s+){0,3}?(?:pastry|cake|bakery|paper|carry|kraft|food|takeaway|meal|boxes|box|bags|bag|containers|container)/);
  const price = text.match(/(?:max|maximum|under|upto|up to|budget|tak|within)?\s*(?:₹|rs\.?\s*|inr\s*)(\d+(?:\.\d+)?)\s*(?:each|per|\/|a piece|ka ek|tak)?/);
  const today = istDate(now);
  let neededBy: string | null = null;
  const inDays = text.match(/(?:in|within)\s*(\d+)\s*days?|(\d+)\s*din\s*(?:mein|me)/);
  if (/\b(tomorrow|kal)\b/.test(text)) neededBy = addDays(today, 1);
  else if (/\b(today|aaj)\b/.test(text)) neededBy = today;
  else if (inDays) neededBy = addDays(today, Number(inDays[1] ?? inDays[2]));
  else {
    const idx = WEEKDAYS.findIndex((d) => text.includes(d));
    const hindi = Object.entries(HINDI_DAYS).find(([d]) => text.includes(d));
    const target = idx >= 0 ? idx : hindi ? hindi[1] : -1;
    if (target >= 0) {
      const dow = new Date(`${today}T12:00:00+05:30`).getUTCDay();
      neededBy = addDays(today, ((target - dow + 7) % 7) || 7);
    } else if (/this week|is hafte/.test(text)) {
      const dow = new Date(`${today}T12:00:00+05:30`).getUTCDay();
      neededBy = addDays(today, (6 - dow + 7) % 7 || 6);
    }
  }
  return {
    productKey,
    quantity: qty ? Number(qty[1].replace(/,/g, "")) : null,
    maxUnitPriceInr: price ? Number(price[1]) : null,
    neededBy,
    sampleFirst: /sample|trial|pehle dekh/.test(text),
    backupSupplier: /backup|already have a supplier|regular supplier|abhi wala supplier|existing supplier/.test(text),
  };
}

/** Fields required before a need can be published. Budget and sample are optional. */
export function missingFields(d: Pick<NeedDraft, "productKey" | "quantity" | "neededBy">): string[] {
  const missing: string[] = [];
  if (!d.productKey) missing.push("product");
  if (!d.quantity) missing.push("quantity");
  if (!d.neededBy) missing.push("needed-by date");
  return missing;
}

export type Need = { productKey: ProductKey; quantity: number; maxUnitPricePaise: number | null; neededBy: string; sampleFirst: boolean };
export type Offer = {
  id: string; sellerMerchantId: string; productKey: string; name: string; unit: string;
  unitPricePaise: number; tiers: { minQty: number; unitPricePaise: number }[]; moq: number;
  stockQty: number | null; stockStatus: "CONFIRMED" | "UNKNOWN" | "UNAVAILABLE"; confirmedAt: Date | null;
  deliveryRadiusKm: number; leadTimeHours: number; sampleAvailable: boolean; sampleNote: string | null;
};
export type CriterionStatus = "PASS" | "FAIL" | "UNKNOWN";
export type Criterion = { id: "product" | "quantity" | "stock" | "delivery_area" | "deadline" | "budget" | "sample"; status: CriterionStatus; label: string };
export type Eligibility = "READY" | "NEEDS_CONFIRMATION" | "EXCLUDED";
export type NeedMatch = {
  offerId: string; sellerMerchantId: string; eligibility: Eligibility; criteria: Criterion[];
  quote: { unitPricePaise: number; subtotalPaise: number; tier: string } | null;
  earliestDelivery: Date; distanceKm: number; reason: string | null;
};

/** Availability confirmations go stale after this many hours (pilot default, configurable). */
export const STOCK_TTL_HOURS = 48;
export const MAX_OFFERS = 3;

export function rupeesFromPaise(paise: number): string {
  const r = paise / 100;
  return `₹${Number.isInteger(r) ? r.toLocaleString("en-IN") : r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Price for the exact quantity: the best tier the quantity qualifies for. */
export function quoteFor(offer: Offer, quantity: number) {
  const tier = [...offer.tiers].filter((t) => quantity >= t.minQty).sort((a, b) => a.unitPricePaise - b.unitPricePaise)[0];
  const unit = tier ? Math.min(tier.unitPricePaise, offer.unitPricePaise) : offer.unitPricePaise;
  return { unitPricePaise: unit, subtotalPaise: unit * quantity, tier: tier && tier.unitPricePaise < offer.unitPricePaise ? `${tier.minQty.toLocaleString("en-IN")}+ tier` : "base price" };
}

function endOfDayIst(iso: string) {
  return new Date(`${iso}T21:00:00+05:30`);
}

export function evaluateNeedMatch(need: Need, offer: Offer, distanceKm: number, now: Date): NeedMatch {
  const criteria: Criterion[] = [];
  const product = PRODUCTS[need.productKey];
  const sameProduct = offer.productKey === need.productKey && offer.unit === product.unit;
  criteria.push({ id: "product", status: sameProduct ? "PASS" : "FAIL", label: sameProduct ? `${offer.name}` : `Doesn't sell ${product.label.toLowerCase()}es` });

  criteria.push(need.quantity >= offer.moq
    ? { id: "quantity", status: "PASS", label: `${need.quantity.toLocaleString("en-IN")} meets minimum order of ${offer.moq.toLocaleString("en-IN")}` }
    : { id: "quantity", status: "FAIL", label: `Minimum order is ${offer.moq.toLocaleString("en-IN")}, you need ${need.quantity.toLocaleString("en-IN")}` });

  const ageHours = offer.confirmedAt ? (now.getTime() - offer.confirmedAt.getTime()) / 3_600_000 : null;
  if (offer.stockStatus === "UNAVAILABLE") criteria.push({ id: "stock", status: "FAIL", label: "Out of stock" });
  else if (offer.stockStatus === "CONFIRMED" && ageHours != null && ageHours <= STOCK_TTL_HOURS && offer.stockQty != null) {
    criteria.push(offer.stockQty >= need.quantity
      ? { id: "stock", status: "PASS", label: `${offer.stockQty.toLocaleString("en-IN")} in stock, confirmed ${ageHours < 1 ? "just now" : `${Math.round(ageHours)}h ago`}` }
      : { id: "stock", status: "FAIL", label: `Only ${offer.stockQty.toLocaleString("en-IN")} in stock` });
  } else criteria.push({ id: "stock", status: "UNKNOWN", label: ageHours != null ? `Stock last confirmed ${Math.round(ageHours / 24)} days ago` : "Stock not confirmed" });

  criteria.push(distanceKm <= offer.deliveryRadiusKm
    ? { id: "delivery_area", status: "PASS", label: `Delivers to you (${distanceKm.toFixed(1)} km, covers ${offer.deliveryRadiusKm} km)` }
    : { id: "delivery_area", status: "FAIL", label: `Outside their delivery area (${distanceKm.toFixed(1)} km, covers ${offer.deliveryRadiusKm} km)` });

  const earliestDelivery = new Date(now.getTime() + offer.leadTimeHours * 3_600_000);
  const deadline = endOfDayIst(need.neededBy);
  const when = earliestDelivery.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
  criteria.push(earliestDelivery <= deadline
    ? { id: "deadline", status: "PASS", label: `Can deliver by ${when}` }
    : { id: "deadline", status: "FAIL", label: `Earliest delivery ${when}, after your date` });

  const quote = sameProduct ? quoteFor(offer, need.quantity) : null;
  if (need.maxUnitPricePaise == null) criteria.push({ id: "budget", status: "PASS", label: "No budget set" });
  else if (quote) criteria.push(quote.unitPricePaise <= need.maxUnitPricePaise
    ? { id: "budget", status: "PASS", label: `${rupeesFromPaise(quote.unitPricePaise)} each, within your ${rupeesFromPaise(need.maxUnitPricePaise)}` }
    : { id: "budget", status: "FAIL", label: `${rupeesFromPaise(quote.unitPricePaise)} each, above your ${rupeesFromPaise(need.maxUnitPricePaise)}` });

  if (need.sampleFirst) criteria.push(offer.sampleAvailable
    ? { id: "sample", status: "PASS", label: offer.sampleNote ?? "Sample available" }
    : { id: "sample", status: "FAIL", label: "No samples" });

  const fail = criteria.find((c) => c.status === "FAIL");
  const unknown = criteria.find((c) => c.status === "UNKNOWN");
  return { offerId: offer.id, sellerMerchantId: offer.sellerMerchantId, eligibility: fail ? "EXCLUDED" : unknown ? "NEEDS_CONFIRMATION" : "READY", criteria, quote, earliestDelivery, distanceKm, reason: fail?.label ?? unknown?.label ?? null };
}

/** Ready offers: cheapest for the exact quantity, then earliest delivery, then nearest. One card per seller, max three. */
export function compareMatches(matches: NeedMatch[]) {
  const ready = matches.filter((m) => m.eligibility === "READY").sort((a, b) => a.quote!.subtotalPaise - b.quote!.subtotalPaise || a.earliestDelivery.getTime() - b.earliestDelivery.getTime() || a.distanceKm - b.distanceKm || a.offerId.localeCompare(b.offerId));
  const seen = new Set<string>();
  const top = ready.filter((m) => !seen.has(m.sellerMerchantId) && seen.add(m.sellerMerchantId)).slice(0, MAX_OFFERS);
  return { top, moreReady: ready.length - top.length, needsConfirmation: matches.filter((m) => m.eligibility === "NEEDS_CONFIRMATION"), excluded: matches.filter((m) => m.eligibility === "EXCLUDED") };
}
