import { z } from "zod";

/** Merchant categories as captured at Paytm onboarding (label → MCC + words a seller might use). */
export const MERCHANT_CATEGORIES = {
  Bakery: { mcc: "5462", words: ["bakery", "bakeries", "baker", "cake", "pastry", "pastries", "bread"] },
  "Cloud kitchen": { mcc: "5812", words: ["cloud kitchen", "cloud kitchens", "tiffin", "delivery kitchen", "dark kitchen"] },
  Cafe: { mcc: "5814", words: ["cafe", "cafes", "café", "coffee", "chai"] },
  Restaurant: { mcc: "5812", words: ["restaurant", "restaurants", "dhaba", "hotel", "eatery"] },
  "Fast food": { mcc: "5814", words: ["fast food", "vada pav", "snack", "snacks", "street food", "sandwich", "chaat", "dosa"] },
  "Ice cream": { mcc: "5814", words: ["ice cream", "ice-cream", "kulfi", "gelato"] },
  "Sweet shop": { mcc: "5441", words: ["sweet", "sweets", "mithai", "mishthan", "halwai"] },
  Dairy: { mcc: "5451", words: ["dairy", "milk", "paneer"] },
  Grocery: { mcc: "5411", words: ["kirana", "grocery", "supermarket", "general store", "mart"] },
  Pharmacy: { mcc: "5912", words: ["pharmacy", "medical", "chemist", "medicos"] },
  Florist: { mcc: "5992", words: ["florist", "flower", "phool"] },
  Clothing: { mcc: "5651", words: ["clothing", "garment", "boutique", "fashion"] },
  Electronics: { mcc: "5732", words: ["electronics", "mobile shop", "phone shop"] },
  Hardware: { mcc: "5251", words: ["hardware"] },
  Salon: { mcc: "7230", words: ["salon", "parlour", "spa"] },
  Packaging: { mcc: "5113", words: ["packaging"] },
} as const;
export type MerchantCategory = keyof typeof MERCHANT_CATEGORIES;
export const CATEGORY_NAMES = Object.keys(MERCHANT_CATEGORIES) as MerchantCategory[];

/** How strongly a seller category sells into a buyer category (0–100). Unlisted pairs score 0. */
export const CATEGORY_AFFINITY: Partial<Record<MerchantCategory, Partial<Record<MerchantCategory, number>>>> = {
  Packaging: { Bakery: 95, "Sweet shop": 92, "Cloud kitchen": 92, "Fast food": 90, Cafe: 88, Restaurant: 80, "Ice cream": 70, Dairy: 60, Grocery: 55, Clothing: 50, Florist: 45, Pharmacy: 40, Electronics: 20, Salon: 15, Hardware: 10 },
  Dairy: { "Sweet shop": 95, Bakery: 85, Cafe: 85, Restaurant: 80, "Cloud kitchen": 80, Grocery: 70 },
  Bakery: { Cafe: 90, Restaurant: 70, Grocery: 60, "Cloud kitchen": 50 },
};

export function affinity(seller: string, buyer: string): number {
  return CATEGORY_AFFINITY[seller as MerchantCategory]?.[buyer as MerchantCategory] ?? 0;
}

/** What merchant buyers say when they push back. Hinglish-first, because that is how they reply. */
export const Objection = z.enum([
  "PRICE_TOO_HIGH", "HAS_SUPPLIER", "BULK_ONLY_MOQ", "QUALITY_DOUBT", "CREDIT_TERMS",
  "DELIVERY_RELIABILITY", "NOT_NOW", "OWNER_UNAVAILABLE", "NOT_INTERESTED", "OTHER",
]);
export type Objection = z.infer<typeof Objection>;

export const OBJECTION_LABELS: Record<Objection, string> = {
  PRICE_TOO_HIGH: "Price too high",
  HAS_SUPPLIER: "Already has a supplier",
  BULK_ONLY_MOQ: "Quantity / MOQ mismatch",
  QUALITY_DOUBT: "Doubts quality",
  CREDIT_TERMS: "Wants credit terms",
  DELIVERY_RELIABILITY: "Worried about delivery",
  NOT_NOW: "Not right now",
  OWNER_UNAVAILABLE: "Owner not available",
  NOT_INTERESTED: "Not interested",
  OTHER: "Other",
};

export const ReplyIntent = z.enum(["OBJECTION", "WANTS_SAMPLE", "WANTS_MEETING", "PLACES_ORDER", "QUESTION", "INTERESTED", "NOT_INTERESTED"]);
export type ReplyIntent = z.infer<typeof ReplyIntent>;

export const STAGES = ["PITCHED", "REPLIED", "OBJECTION", "SAMPLE_REQUESTED", "SAMPLE_SENT", "MEETING_BOOKED", "ORDER_WON", "LOST"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  PITCHED: "Pitched",
  REPLIED: "Replied",
  OBJECTION: "Objection",
  SAMPLE_REQUESTED: "Sample requested",
  SAMPLE_SENT: "Sample sent",
  MEETING_BOOKED: "Meeting booked",
  ORDER_WON: "Order won",
  LOST: "Lost",
};

/** Simplified track shown on the merchant page. */
export const STAGE_TRACK = ["Found", "Pitched", "Talking", "Sample", "Order"] as const;
export function trackIndex(stage: string): number {
  switch (stage) {
    case "PITCHED": return 1;
    case "REPLIED": case "OBJECTION": case "MEETING_BOOKED": return 2;
    case "SAMPLE_REQUESTED": case "SAMPLE_SENT": return 3;
    case "ORDER_WON": return 4;
    default: return 1;
  }
}

export const SIGNAL_LABELS: Record<string, string> = {
  NEW_OUTLET: "New outlet",
  TXN_SPIKE: "Payments rising",
  FESTIVE_SEASON: "Festive demand",
  RATING_JUMP: "Rating up",
  MENU_EXPANSION: "Menu expanded",
  NEW_LISTING: "Newly listed",
};

export const SellerOffers = z.object({
  catalog: z.array(z.object({
    sku: z.string(), name: z.string(), unitPriceInr: z.number(),
    inStock: z.boolean().default(true),
    /** Buyer categories this SKU plausibly serves (seller-confirmed). */
    servesCategories: z.array(z.string()).default([]),
  })),
  tiers: z.array(z.object({ minQty: z.number(), unitPriceInr: z.number(), label: z.string(), launchedOn: z.string() })),
  freeSample: z.object({ enabled: z.boolean(), perWeek: z.number(), contents: z.string() }),
  credit: z.object({ days: z.number(), viaPaytmPostpaid: z.boolean() }),
  deliveryRadiusKm: z.number(),
  sameDayCutoff: z.string(),
  moq: z.number(),
  /** Largest monthly volume the seller can commit to one buyer; null = not yet asked (triggers one clarification). */
  maxMonthlyUnitsPerBuyer: z.number().nullable().default(null),
  proofPoints: z.array(z.string()),
});
export type SellerOffers = z.infer<typeof SellerOffers>;

/** private = seller-facing aggregate (e.g. QR receipts trend); never shown to the buyer or used in a pitch. */
export type MerchantSignal = { type: string; title: string; date: string; source: string; private?: boolean };
export type MerchantProfile = { sources: { source: string; rating: number; reviews: number }[]; instagram: string | null; highlights: string[]; currentPackaging: string | null };
export type Reason = { text: string; source: string; kind: "paytm" | "web" | "signal" | "fit" };

/** ₹5, ₹4.20, ₹1,000: paise shown only when present, always two digits. */
export function rupees(n: number): string {
  return `₹${Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toFixed(2)}`;
}
