// Writes the Sarvam agent knowledge base from the seller's real offer sheet: docs/vyapar/kb/ecopack-knowledge-base.md
// Usage: npx tsx scripts/build-agent-kb.ts   (re-run after changing offers; upload the file in the agent's Knowledge Base)
import { mkdirSync, writeFileSync } from "node:fs";
import { ECOPACK_OFFERS as o } from "../prisma/vyapar-seed";

const tier = o.tiers[0];
const md = `# EcoPack Solutions: product and policy facts (for the Vyapar SDR agent)

Answer only from these facts. If something is not here, say Rahul ji will confirm on Telegram.

## Who we are
EcoPack Solutions, Chakala, Andheri East, Mumbai. Owner: Rahul. Paytm merchant. We make paper carry bags, pastry boxes and biodegradable food boxes for bakeries, sweet shops, cafes and cloud kitchens.

## Products and prices (per piece, GST extra unless stated)
${o.catalog.map((c) => `- ${c.name}: ₹${c.unitPriceInr}. Serves ${c.servesCategories.slice(0, 5).join(", ").toLowerCase()}.`).join("\n")}
- Bulk tier (paper bags): ₹${tier.unitPriceInr.toFixed(2)} each for ${tier.minQty.toLocaleString("en-IN")}+ pcs. Example: 1,000 bags = ₹${(tier.unitPriceInr * 1000).toLocaleString("en-IN")}.
- Minimum order: ${o.moq} pcs per product.

## Quality
- Food-grade, grease-proof paper (safe for bakery items and snacks).
- Food boxes are biodegradable.
- Anything else (weight limits, custom printing, colours): Rahul ji will confirm on Telegram.

## Samples
- Free sample: ${o.freeSample.contents}. Up to ${o.freeSample.perWeek} sample packs a week.
- Delivered to the shop at a time the buyer chooses, usually next day.

## Delivery
- Same-day delivery within ${o.deliveryRadiusKm} km of Chakala if ordered by ${o.sameDayCutoff}; otherwise next day.
- Delivery charges outside that area: Rahul ji will confirm.

## Payment and billing
- Pay by Paytm (UPI / QR) or Paytm payment link.
- ${o.credit.days}-day credit available via Paytm Postpaid${o.credit.viaPaytmPostpaid ? " (we get paid upfront; the buyer pays later)" : ""}.
- Proper GST invoice with every order.

## Proof points
${o.proofPoints.map((p) => `- ${p}`).join("\n")}
`;
mkdirSync("docs/vyapar/kb", { recursive: true });
writeFileSync("docs/vyapar/kb/ecopack-knowledge-base.md", md);
console.log("wrote docs/vyapar/kb/ecopack-knowledge-base.md");
export {};
