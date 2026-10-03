import { OBJECTION_LABELS, rupees, type MerchantSignal, type Objection, type SellerOffers } from "@/lib/vyapar/taxonomy";
import { freshSignals } from "@/lib/vyapar/scoring";

export type OpenObjection = { dealId: string; merchantName: string; merchantId: string; category: Objection; quote: string | null; saidAt: Date; signals: MerchantSignal[]; valueInr: number };
export type Revival = { dealId: string; merchantId: string; merchantName: string; category: Objection; quote: string | null; saidAt: Date; changes: string[]; score: number; cta: string; valueInr: number };

/**
 * Revive engine: an old "no" becomes a "now" when the reason behind it stops being true.
 * Price objections revive when a cheaper tier launched after the objection; any objection warms up
 * when the buyer shows a fresh demand signal (festive season, new outlet, payments rising).
 */
export function findRevivals(open: OpenObjection[], offers: SellerOffers, today: Date): Revival[] {
  const revivals: Revival[] = [];
  for (const o of open) {
    const changes: string[] = [];
    let score = 0;
    let cta = "Follow up";
    const newTier = offers.tiers.find((t) => new Date(`${t.launchedOn}T12:00:00+05:30`) > o.saidAt);
    if (o.category === "PRICE_TOO_HIGH" && newTier) {
      changes.push(`You launched the ${rupees(newTier.unitPriceInr)} ${newTier.label.toLowerCase()} on ${new Date(`${newTier.launchedOn}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`);
      score = 92;
      cta = `Send the ${rupees(newTier.unitPriceInr)} offer`;
    }
    if (o.category === "CREDIT_TERMS" && offers.credit.viaPaytmPostpaid) {
      changes.push(`${offers.credit.days}-day credit is now available via Paytm Postpaid`);
      score = Math.max(score, 78);
      cta = "Offer pay-later";
    }
    const demand = freshSignals(o.signals, today).filter((s) => s.date > o.saidAt.toISOString().slice(0, 10));
    for (const s of demand.slice(0, 1)) {
      changes.push(s.title);
      score = Math.max(score, o.category === "NOT_NOW" ? 85 : 60) + (score ? 4 : 0);
      if (cta === "Follow up") cta = s.type === "FESTIVE_SEASON" ? "Send a festive offer" : "Re-pitch now";
    }
    if (changes.length) revivals.push({ dealId: o.dealId, merchantId: o.merchantId, merchantName: o.merchantName, category: o.category, quote: o.quote, saidAt: o.saidAt, changes, score: Math.min(99, score), cta, valueInr: o.valueInr });
  }
  return revivals.sort((a, b) => b.score - a.score);
}

export type ObjectionCount = { category: Objection; label: string; count: number; quotes: string[] };

export function aggregateObjections(items: { category: string | null; quote: string | null }[]): ObjectionCount[] {
  const map = new Map<Objection, ObjectionCount>();
  for (const item of items) {
    if (!item.category || item.category === "OTHER" || item.category === "NOT_INTERESTED") continue;
    const category = item.category as Objection;
    const entry = map.get(category) ?? { category, label: OBJECTION_LABELS[category], count: 0, quotes: [] };
    entry.count += 1;
    if (item.quote && entry.quotes.length < 3) entry.quotes.push(item.quote);
    map.set(category, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export type CampaignAssets = {
  inapp: { title: string; subtitle: string; cta: string };
  whatsapp: string;
  instagram: { headline: string; sub: string; caption: string };
};

/** Campaign that answers the most common objection before buyers raise it. */
export function templateCampaign(category: Objection, seller: { name: string; area: string; handle: string }, offers: SellerOffers, audience: number): { headline: string; assets: CampaignAssets } {
  const tier = [...offers.tiers].sort((a, b) => a.unitPriceInr - b.unitPriceInr)[0];
  const price = rupees(tier ? tier.unitPriceInr : offers.catalog[0]?.unitPriceInr ?? 0);
  switch (category) {
    case "CREDIT_TERMS":
      return {
        headline: 'Answer "we need credit" up front',
        assets: {
          inapp: { title: `Packaging now, pay in ${offers.credit.days} days`, subtitle: `${seller.name} · Paytm Postpaid accepted · free sample`, cta: "Get sample" },
          whatsapp: `Paytm merchants ke liye ${seller.name}: packaging abhi lo, payment ${offers.credit.days} din baad (Paytm Postpaid) 🙏 Free sample ke liye "SAMPLE" reply karein 📦`,
          instagram: { headline: "Stock now.\nPay later.", sub: `${offers.credit.days}-day credit for Paytm merchants`, caption: `${seller.area} ke bakers aur cafes ab pay-later pe packaging le rahe hain 🌱 #Mumbai #Andheri #SmallBusiness` },
        },
      };
    case "HAS_SUPPLIER":
    case "DELIVERY_RELIABILITY":
      return {
        headline: "Be the backup supplier that never runs late",
        assets: {
          inapp: { title: "Same-day packaging, 2 km away", subtitle: `${seller.name} · order by ${offers.sameDayCutoff}, get it today`, cta: "Save as backup" },
          whatsapp: `Supplier late? ${seller.name} ${seller.area} se same-day delivery karta hai (${offers.sameDayCutoff} tak order). Free sample: reply "SAMPLE" 📦`,
          instagram: { headline: "Stock khatam?\nAaj hi milega.", sub: `Same-day packaging in ${seller.area}`, caption: `Never run out during rush hour again 🚚 #Mumbai #Andheri #Bakery` },
        },
      };
    default:
      return {
        headline: 'Answer "price too high" before they say it',
        assets: {
          inapp: { title: `Bulk paper bags at ${price}/pc`, subtitle: `${seller.name} · nearby · free sample for Paytm merchants`, cta: "Claim sample" },
          whatsapp: `Diwali special 🪔 Paytm merchants ke liye ${seller.name} ke paper bags ab sirf ${price} (${tier?.minQty.toLocaleString("en-IN") ?? "bulk"}+ pcs). Free sample, same-day delivery ${seller.area} mein. Reply "SAMPLE" 📦`,
          instagram: { headline: "Plastic hatao.\nProfit badhao.", sub: `Paper bags from ${price} · Andheri`, caption: `${seller.area} ke bakeries ne is mahine switch kiya 🌱 ${seller.handle} #Mumbai #Andheri #EcoFriendly` },
        },
      };
  }
}

/** Seeded growth-loop history: objection → counter play → share that reached sample/order. */
export const PLAY_OUTCOMES = [
  { objection: "PRICE_TOO_HIGH", play: "Bulk tier + sample", tried: 21, sample: 13, order: 7 },
  { objection: "HAS_SUPPLIER", play: "Backup supplier + sample", tried: 17, sample: 7, order: 3 },
  { objection: "CREDIT_TERMS", play: "Pay later via Paytm Postpaid", tried: 14, sample: 5, order: 4 },
  { objection: "QUALITY_DOUBT", play: "Free sample", tried: 12, sample: 7, order: 4 },
] as const;
