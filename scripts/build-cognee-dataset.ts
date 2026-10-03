// Builds the Vyapar vendor/buyer knowledge dataset for Cognee from the demo fixtures (all fictional, Demo data).
// Usage: npx tsx scripts/build-cognee-dataset.ts   → writes data/cognee/*.txt
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import merchants from "../data/merchants.json";
import suppliers from "../data/supplier-offers.json";

const OUT = "data/cognee";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const docs: Record<string, string> = {};
const rs = (p: number) => `₹${(p / 100).toFixed(2).replace(/\.00$/, "")}`;
const LABEL: Record<string, string> = { pastry_box: "pastry boxes", paper_bag: "paper bags", food_container: "food containers" };

// Fulfilment notes are fictional demo facts so the graph can link vendors, buyers and outcomes.
const HISTORY: Record<string, string[]> = {
  "m-ecopack-solutions": ["Sweet Nest Bakers ordered 2,000 paper bags from EcoPack Solutions in September 2026 after a free sample; delivered on time.", "Brew Lane Cafe received an EcoPack Solutions sample pack on 1 October 2026 and asked about paper cups."],
  "m-greenbox-andheri": ["GreenBox Andheri delivers same day inside Andheri West; Ghar Ka Khana reported two same-day deliveries in September 2026.", "GreenBox Andheri window pastry boxes cost more but buyers like the clear window for display."],
  "m-packright-supplies": ["PackRight Supplies charges ₹50 for a trial pack instead of free samples.", "Mama's Oven said PackRight Supplies boxes were sturdy but delivery took two days."],
  "m-mumbai-kraft-house": ["Mumbai Kraft House has not reconfirmed stock since late September 2026.", "Sweet Nest Bakers complained in August 2026 that Mumbai Kraft House kraft pastry boxes leaked grease with butter cakes."],
  "m-sharma-packaging-co": ["Sharma Packaging Co. only sells in bulk: minimum order 1,000 boxes; cheapest per box but no samples."],
  "m-quickpack-traders": ["QuickPack Traders makes pastry boxes to order with a 7-day lead time; good for planned festive orders, not urgent ones."],
  "m-thane-box-depot": ["Thane Box Depot is cheap but only delivers within 6 km of Thane, which excludes Andheri."],
  "m-wrap-n-roll": ["Wrap N Roll sells only kraft paper bags, no boxes; Chai Sutta Corner buys bags from them."],
  "m-premium-pack-studio": ["Premium Pack Studio makes printed luxury boxes at ₹14.50 each, used by gift shops for Diwali hampers."],
};

const all = [...merchants, ...suppliers.sellers.map((s) => ({ id: s.id, name: s.name, ownerName: s.ownerName, category: "Packaging", area: s.area }))];
for (const s of all.filter((m) => m.category === "Packaging")) {
  const offers = suppliers.offers.filter((o) => o.seller === s.id);
  docs[`vendor-${s.id}`] = [
    `Vendor: ${s.name} (packaging supplier, ${s.area}, Mumbai). Owner: ${s.ownerName}. Paytm merchant (demo data).`,
    ...offers.map((o) => `${s.name} sells ${o.name} (${LABEL[o.productKey]}) at ${rs(o.unitPricePaise)} per ${o.unit}${o.tiers.length ? `, ${rs(o.tiers[0].unitPricePaise)} for ${o.tiers[0].minQty}+` : ""}; minimum order ${o.moq}; delivers within ${o.deliveryRadiusKm} km in ${o.leadTimeHours} hours; ${o.sampleAvailable ? `samples: ${o.sampleNote}` : "no samples"}; stock ${o.stockStatus === "CONFIRMED" ? `${o.stockQty} confirmed ${o.confirmedHoursAgo} hours before the demo` : "not confirmed"}.`),
    ...(HISTORY[s.id] ?? []),
  ].join("\n");
}

for (const m of merchants.filter((x) => x.category !== "Packaging")) {
  const signals = (m.signals as { title: string; date: string; source: string; private?: boolean }[]).filter((s) => !s.private).map((s) => `${s.title} (${s.source}, ${s.date})`);
  docs[`buyer-${m.id}`] = [
    `Buyer: ${m.name}, a ${m.category.toLowerCase()} in ${m.area}, Andheri, Mumbai. Owner: ${m.ownerName}. Paytm merchant (demo data).`,
    m.profile.sources[0] ? `${m.name} is rated ${m.profile.sources[0].rating} on ${m.profile.sources[0].source} from ${m.profile.sources[0].reviews} reviews.` : "",
    ...m.profile.highlights.map((h: string) => `${m.name}: ${h}.`),
    m.profile.currentPackaging ? `${m.name} currently uses ${m.profile.currentPackaging}.` : "",
    ...signals.map((s: string) => `${m.name} recent public signal: ${s}.`),
  ].filter(Boolean).join("\n");
}

// Past conversations (same as the seeded deals) — objections and outcomes are what Cognee connects.
const CONVERSATIONS: [string, string][] = [
  ["Sharma Sweets", "12 Sep 2026: EcoPack Solutions pitched paper bags at ₹5. Manoj Sharma replied: \"Bhai ₹5 bahut hai. Bulk mein sasta do toh sochenge.\" Objection: price too high. Still open. EcoPack launched a ₹4.20 bulk tier on 1 Oct 2026."],
  ["Biryani Box Cloud Kitchen", "30 Sep 2026: Imran Shaikh said: \"Rate theek hai par 60 din ka credit chahiye. Cash mein nahi lete.\" Objection: wants credit terms. EcoPack offers 15-day credit via Paytm Postpaid."],
  ["Tiffin Tales", "2 Oct 2026: Ritu Verma needs boxes for a new party-orders menu and booked a shop visit for Thursday 8 Oct, 4 PM."],
  ["Crust & Crumb", "25 Sep 2026: pitched, no reply for 9 days. Going cold."],
  ["Sweet Nest Bakers", "20 Sep 2026: took a free sample from EcoPack. 26 Sep: \"Sample achha tha! 2000 bags bhej do.\" Order won: ₹8,400 paid via Paytm payment link."],
  ["Brew Lane Cafe", "30 Sep 2026: asked \"Paper cups bhi hain kya?\" and took a sample. Sample delivered 1 Oct."],
  ["Wok Express Kitchen", "22 Sep 2026: \"Humara supplier pehle se fix hai bhai. Foil wale containers lete hain.\" Objection: already has a supplier."],
  ["Mama's Oven", "28 Sep 2026: \"Pichhle supplier ke boxes kamzor the. Quality kaisi hai aapki?\" Objection: doubts quality."],
  ["Gupta Mishthan Bhandar", "3 Oct 2026: \"Achha, Diwali ke gift box ka price list bhejo.\" Interested in Diwali gift boxes."],
];
for (const [name, text] of CONVERSATIONS) docs[`conversation-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`] = `Conversation between EcoPack Solutions (seller) and ${name} (buyer). ${text}`;

docs["market-andheri-packaging"] = [
  "Market note (demo): bakeries and sweet shops in Andheri usually buy 500–1,000 pastry boxes a month and restock around the start of the month.",
  "Demand for pastry and gift boxes roughly doubles in the two weeks before Diwali.",
  "Price is the most common objection from bakeries; a bulk tier plus a free sample converted most of them in September 2026.",
  "Cloud kitchens care about credit terms and leak-proof containers more than price.",
].join("\n");

for (const [id, text] of Object.entries(docs)) writeFileSync(`${OUT}/${id}.txt`, `${text}\n`);
console.log(`${Object.keys(docs).length} documents written to ${OUT}`);
