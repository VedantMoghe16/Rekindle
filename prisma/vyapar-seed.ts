import merchants from "../data/merchants.json";
import osm from "../data/andheri-osm.json";
import { db } from "../src/lib/db";
import type { SellerOffers } from "../src/lib/vyapar/taxonomy";

export const SELLER_MERCHANT_ID = "m-ecopack-solutions";
export const SELLER_ID = "seller-ecopack";

export const ECOPACK_OFFERS: SellerOffers = {
  catalog: [
    { sku: "PX-6", name: "Pastry box 6 inch", unitPriceInr: 9, inStock: true, servesCategories: ["Bakery", "Sweet shop", "Cafe"] },
    { sku: "FB-500", name: "Biodegradable food box 500 ml", unitPriceInr: 7, inStock: true, servesCategories: ["Cloud kitchen", "Restaurant", "Fast food", "Cafe"] },
    { sku: "PB-S", name: "Paper carry bag (small)", unitPriceInr: 5, inStock: true, servesCategories: ["Bakery", "Sweet shop", "Cafe", "Restaurant", "Fast food", "Cloud kitchen", "Ice cream", "Dairy", "Grocery", "Pharmacy", "Clothing", "Florist"] },
  ],
  tiers: [{ minQty: 1000, unitPriceInr: 4.2, label: "Bulk tier", launchedOn: "2026-10-01" }],
  freeSample: { enabled: true, perWeek: 20, contents: "25 bags + 10 pastry boxes" },
  credit: { days: 15, viaPaytmPostpaid: true },
  deliveryRadiusKm: 8,
  sameDayCutoff: "2 PM",
  moq: 200,
  maxMonthlyUnitsPerBuyer: null,
  proofPoints: ["Food-grade, grease-proof paper", "Same-day delivery across Andheri", "Used by 40+ Mumbai bakeries"],
};

type Msg = [direction: "out" | "in", at: string, text: string, kind?: string];
type SeedDeal = {
  merchantId: string; stage: string; valueInr: number; objection?: string; nextStep?: string; messages: Msg[];
  memories?: { kind: string; category?: string; summary: string; quote?: string; at: string; resolved?: boolean }[];
  actions?: { type: string; status: string; summary: string; at: string; ref: string }[];
};

const t = (iso: string) => new Date(`${iso}+05:30`);

const PITCH = (first: string, km: string) => `Namaste ${first} ji! 🙏 Main Rahul, EcoPack Solutions se, aapke yahan se bas ${km} door. Eco-friendly paper bags aur food boxes ₹5 se, same-day delivery. Kya ek free sample bhijwa doon?`;

const DEALS: SeedDeal[] = [
  {
    merchantId: "m-sharma-sweets", stage: "OBJECTION", valueInr: 9000, objection: "PRICE_TOO_HIGH", nextStep: "Revive with the ₹4.20 bulk tier",
    messages: [["out", "2026-09-12T10:05:00", PITCH("Manoj", "2.2 km")], ["in", "2026-09-12T13:40:00", "Bhai ₹5 bahut hai. Bulk mein sasta do toh sochenge."]],
    memories: [{ kind: "OBJECTION", category: "PRICE_TOO_HIGH", summary: "Says ₹5 is too much; open to a bulk price", quote: "Bhai ₹5 bahut hai.", at: "2026-09-12T13:40:00" }],
  },
  {
    merchantId: "m-biryani-box-cloud-kitchen", stage: "OBJECTION", valueInr: 9500, objection: "CREDIT_TERMS", nextStep: "Offer pay-later via Paytm Postpaid",
    messages: [["out", "2026-09-30T11:20:00", PITCH("Imran", "3.4 km")], ["in", "2026-09-30T16:02:00", "Rate theek hai par 60 din ka credit chahiye. Cash mein nahi lete."]],
    memories: [{ kind: "OBJECTION", category: "CREDIT_TERMS", summary: "Wants 60 days credit; price is fine", quote: "Rate theek hai par 60 din ka credit chahiye.", at: "2026-09-30T16:02:00" }],
  },
  {
    merchantId: "m-tiffin-tales", stage: "MEETING_BOOKED", valueInr: 4800, nextStep: "Visit Thu 8 Oct, 4 PM with samples",
    messages: [["out", "2026-10-02T09:45:00", PITCH("Ritu", "4.6 km")], ["in", "2026-10-02T12:10:00", "Party orders ke liye boxes chahiye. Haan milte hain, Thursday 4 baje aa jao."], ["out", "2026-10-02T12:11:00", "Bilkul Ritu ji! Thursday 4 baje samples ke saath aata hoon 🙏"]],
    memories: [{ kind: "PREFERENCE", summary: "Needs boxes for the new party-orders menu", quote: "Party orders ke liye boxes chahiye.", at: "2026-10-02T12:10:00" }],
    actions: [{ type: "MEETING", status: "scheduled", summary: "Shop visit · Thu 8 Oct, 4:00 PM · Bhawarkuan", at: "2026-10-02T12:11:00", ref: "VY-2274" }],
  },
  {
    merchantId: "m-crust-and-crumb", stage: "PITCHED", valueInr: 3200, nextStep: "No reply in 9 days. Try a voice note",
    messages: [["out", "2026-09-25T10:30:00", PITCH("Aman", "4.9 km")]],
  },
  {
    merchantId: "m-sweet-nest-bakers", stage: "ORDER_WON", valueInr: 8400, nextStep: "Reorder reminder on 25 Oct",
    messages: [["out", "2026-09-20T10:00:00", PITCH("Pooja", "1.6 km")], ["in", "2026-09-20T11:30:00", "Theek hai, sample bhejo."], ["out", "2026-09-20T11:31:00", "Done Pooja ji ✅ Sample kal 11 baje tak pahunch jaayega."], ["in", "2026-09-26T15:05:00", "Sample achha tha! 2000 bags bhej do, order confirm."], ["out", "2026-09-26T15:06:00", "Order confirm ✅ Dhanyavaad Pooja ji! Paytm payment link bhej raha hoon."]],
    memories: [{ kind: "COMMITMENT", summary: "Ordered 2,000 bags at ₹4.20 after the sample", quote: "Sample achha tha!", at: "2026-09-26T15:05:00" }],
    actions: [
      { type: "SAMPLE_DISPATCH", status: "delivered", summary: "Sample pack delivered · 21 Sep, 10:40 AM", at: "2026-09-20T11:31:00", ref: "VY-2201" },
      { type: "PAYMENT_LINK", status: "paid", summary: "₹8,400 received via Paytm payment link", at: "2026-09-26T15:06:00", ref: "PTM-LNK-88231" },
    ],
  },
  {
    merchantId: "m-brew-lane-cafe", stage: "SAMPLE_SENT", valueInr: 5600, nextStep: "Ask for feedback on Monday",
    messages: [["out", "2026-09-30T10:15:00", PITCH("Aditi", "2.9 km")], ["in", "2026-09-30T18:20:00", "Paper cups bhi hain kya? Theek hai sample bhejo."], ["out", "2026-09-30T18:21:00", "Done Aditi ji ✅ Sample kal tak pahunch jaayega."]],
    memories: [{ kind: "PREFERENCE", summary: "Also asked about paper cups", quote: "Paper cups bhi hain kya?", at: "2026-09-30T18:20:00" }],
    actions: [{ type: "SAMPLE_DISPATCH", status: "delivered", summary: "Sample pack delivered · 1 Oct, 11:05 AM", at: "2026-09-30T18:21:00", ref: "VY-2262" }],
  },
  {
    merchantId: "m-wok-express-kitchen", stage: "OBJECTION", valueInr: 6000, objection: "HAS_SUPPLIER", nextStep: "Position as backup supplier",
    messages: [["out", "2026-09-22T12:00:00", PITCH("Ankit", "2.4 km")], ["in", "2026-09-22T19:45:00", "Humara supplier pehle se fix hai bhai. Foil wale containers lete hain."]],
    memories: [{ kind: "OBJECTION", category: "HAS_SUPPLIER", summary: "Has a fixed supplier for foil containers", quote: "Humara supplier pehle se fix hai bhai.", at: "2026-09-22T19:45:00" }],
  },
  {
    merchantId: "m-mama-s-oven", stage: "OBJECTION", valueInr: 4000, objection: "QUALITY_DOUBT", nextStep: "Send a free sample",
    messages: [["out", "2026-09-28T10:40:00", PITCH("Sneha", "3.0 km")], ["in", "2026-09-28T14:15:00", "Pichhle supplier ke boxes kamzor the. Quality kaisi hai aapki?"]],
    memories: [{ kind: "OBJECTION", category: "QUALITY_DOUBT", summary: "Previous boxes were flimsy; worried about quality", quote: "Pichhle supplier ke boxes kamzor the.", at: "2026-09-28T14:15:00" }],
  },
  {
    merchantId: "m-gupta-mishthan-bhandar", stage: "REPLIED", valueInr: 7200, nextStep: "Share Diwali price list",
    messages: [["out", "2026-10-03T11:00:00", PITCH("Ramesh", "3.3 km")], ["in", "2026-10-03T17:30:00", "Achha, Diwali ke gift box ka price list bhejo."]],
    memories: [{ kind: "PREFERENCE", summary: "Interested in Diwali gift boxes", quote: "Diwali ke gift box ka price list bhejo.", at: "2026-10-03T17:30:00" }],
  },
];

/** Wipes and reseeds Vyapar AI data. Merchants come from data/merchants.json. Never touches caches. */
export async function seedVyapar() {
  await db.vyaparEvent.deleteMany();
  await db.vyaparPreference.deleteMany();
  await db.vyaparCampaign.deleteMany();
  await db.vyaparAction.deleteMany();
  await db.vyaparMemory.deleteMany();
  await db.vyaparMessage.deleteMany();
  await db.vyaparDeal.deleteMany();
  await db.vyaparLead.deleteMany();
  await db.vyaparHunt.deleteMany();
  await db.vyaparSeller.deleteMany();
  await db.merchant.deleteMany();

  await db.merchant.createMany({
    data: merchants.map(({ profile, signals, ...m }) => ({ ...m, profileJson: JSON.stringify(profile), signalsJson: JSON.stringify(signals) })),
  });
  await db.merchant.createMany({ data: publicListings() });
  await db.vyaparSeller.create({
    data: { id: SELLER_ID, merchantId: SELLER_MERCHANT_ID, ownerFirstName: "Rahul", product: "Paper bags & food boxes", productCategory: "Packaging", unitPriceInr: 5, offersJson: JSON.stringify(ECOPACK_OFFERS), autopilot: true },
  });

  for (const d of DEALS) {
    const merchant = merchants.find((m) => m.id === d.merchantId)!;
    const last = d.messages[d.messages.length - 1][1];
    await db.vyaparDeal.create({
      data: {
        merchantId: d.merchantId, stage: d.stage, valueInr: d.valueInr, objection: d.objection ?? null, nextStep: d.nextStep ?? null, lastTouchAt: t(last), createdAt: t(d.messages[0][1]),
        messages: { create: d.messages.map(([direction, at, text, kind]) => ({ direction, text, kind: kind ?? "text", author: direction === "out" ? "Vyapar AI" : merchant.ownerName, provider: direction === "out" ? "template" : null, createdAt: t(at) })) },
        memories: { create: (d.memories ?? []).map((m) => ({ merchantId: d.merchantId, kind: m.kind, category: m.category ?? null, summary: m.summary, quote: m.quote ?? null, verified: Boolean(m.quote && d.messages.some(([, , text]) => text.includes(m.quote!))), resolved: m.resolved ?? false, createdAt: t(m.at) })) },
        actions: { create: (d.actions ?? []).map((a) => ({ type: a.type, status: a.status, summary: a.summary, payloadJson: "{}", ref: a.ref, provider: "simulated", createdAt: t(a.at) })) },
      },
    });
  }
  return { merchants: merchants.length, deals: DEALS.length };
}

/** Regional chains the OSM brand tag misses; they also buy packaging centrally. */
const REGIONAL_CHAINS = /\b(birdy'?s|merwans|yazdani|kyani|hearsch|sweet bengal|brijwasi|tewari|tiwari brothers|gurukripa|mahesh lunch|ideal corner|shiv sagar|cream centre|sardar)\b/i;

/** Nearest Andheri locality by bearing and distance from the station, for listings without an address. */
function locality(lat: number, lng: number) {
  const dx = (lng - 72.8464) * 111 * Math.cos((19.12 * Math.PI) / 180);
  const dy = (lat - 19.1197) * 111;
  const d = Math.hypot(dx, dy);
  const b = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  if (d < 0.8) return "Andheri station";
  if (b >= 45 && b < 135) return d < 2 ? "Andheri East" : "Marol";
  if (b >= 135 && b < 225) return d < 2 ? "Irla" : "Juhu";
  if (b >= 225 && b < 315) return d < 2 ? "Andheri West" : "Versova";
  return d < 2 ? "Azad Nagar" : "Lokhandwala";
}

/** Real places from the OpenStreetMap snapshot. Only public map facts; Paytm status, contact and timing are unknown. */
function publicListings() {
  return osm.places.map((p) => ({
    id: `osm-${p.osmId.replace("/", "-")}`, mid: null, name: p.name, ownerName: "", category: p.category, mcc: "", area: p.suburb ?? locality(p.lat, p.lng), city: "Mumbai",
    lat: p.lat, lng: p.lng, phoneMasked: null, gstinMasked: null, qrVolumeBand: "Unknown", monthlyTxns: null, rating: null, reviewCount: null, language: "hinglish",
    profileJson: JSON.stringify({ sources: [], instagram: null, highlights: [], currentPackaging: null }), signalsJson: "[]", isDemo: false,
    source: "osm", osmId: p.osmId, street: p.street, cuisine: p.cuisine, openingHours: p.openingHours, website: p.website,
    brand: p.brand ?? (REGIONAL_CHAINS.test(p.name) ? p.name : null), contactStatus: "unknown", contactRole: null, paytmStatus: "unknown", observedAt: osm.observedAt,
  }));
}
