import type { ReplyUnderstanding } from "@/lib/vyapar/replies";
import type { Objection, SellerOffers } from "@/lib/vyapar/taxonomy";

export type CounterContext = {
  buyerFirstName: string;
  sellerFirstName: string;
  offers: SellerOffers;
  understanding: ReplyUnderstanding;
};

export type CounterPlay = {
  id: string;
  label: string;
  /** Share of past deals where this play moved the buyer to sample or order (seeded growth-loop history). */
  winRate: number;
  next: "SAMPLE_DISPATCH" | "MEETING" | "PAYMENT_LINK" | "FOLLOW_UP" | null;
  render: (ctx: CounterContext) => string;
};

const bestTier = (o: SellerOffers) => [...o.tiers].sort((a, b) => a.unitPriceInr - b.unitPriceInr)[0];
const inr = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

export const PLAYS: Record<Objection | "SAMPLE" | "MEETING" | "ORDER" | "INFO", CounterPlay[]> = {
  PRICE_TOO_HIGH: [
    {
      id: "bulk_tier", label: "Bulk tier + free sample", winRate: 62, next: null,
      render: ({ buyerFirstName, offers, understanding }) => {
        const tier = bestTier(offers);
        const competitor = understanding.competitorPriceInr ? `${inr(understanding.competitorPriceInr)} wale bags aksar grease mein phat jaate hain. ` : "";
        return `Samajh sakta hoon ${buyerFirstName} ji 🙏 ${competitor}Hamara food-grade grease-proof paper hai. ${tier ? `${tier.minQty.toLocaleString("en-IN")}+ pcs pe rate ${inr(tier.unitPriceInr)} ho jaayega, ` : ""}aur pehle free sample bhejte hain. Quality khud dekh lijiye?`;
      },
    },
    { id: "quality_angle", label: "Quality angle: grease-proof, no leaks", winRate: 28, next: null, render: ({ buyerFirstName }) => `${buyerFirstName} ji, sasta bag phat jaaye toh customer ka order kharab hota hai. Hamare bags grease-proof hain. Ek baar sample try kijiye, fark dikhega 🙂` },
  ],
  HAS_SUPPLIER: [
    { id: "backup_supplier", label: "Be the backup supplier + sample", winRate: 41, next: null, render: ({ buyerFirstName, offers }) => `Bilkul ${buyerFirstName} ji, supplier badalne ki zarurat nahi. Hume backup ki tarah rakh lijiye: ${offers.sameDayCutoff} tak order karo, same-day delivery. Free sample se shuru karein?` },
  ],
  BULK_ONLY_MOQ: [
    { id: "small_moq", label: "Low MOQ trial order", winRate: 47, next: null, render: ({ buyerFirstName, offers }) => `Koi baat nahi ${buyerFirstName} ji, sirf ${offers.moq} pcs se shuru kar sakte hain. Pasand aaye toh bulk rate milega.` },
  ],
  QUALITY_DOUBT: [
    { id: "free_sample", label: "Free sample, judge yourself", winRate: 58, next: null, render: ({ buyerFirstName, offers }) => `${buyerFirstName} ji, aap khud check kijiye 🙏 Free sample (${offers.freeSample.contents}) kal tak bhej deta hoon. ${offers.proofPoints[2] ?? ""}`.trim() },
  ],
  CREDIT_TERMS: [
    { id: "postpaid_credit", label: "Pay later via Paytm Postpaid", winRate: 35, next: null, render: ({ buyerFirstName, offers }) => `Haan ${buyerFirstName} ji, ${offers.credit.days} din ka credit de sakte hain${offers.credit.viaPaytmPostpaid ? ", Paytm Postpaid se. Aapko abhi kuch pay nahi karna" : ""}. Pehla order chhota rakhein?` },
  ],
  DELIVERY_RELIABILITY: [
    { id: "same_day", label: "Same-day delivery promise", winRate: 44, next: null, render: ({ buyerFirstName, offers }) => `${buyerFirstName} ji, hum ${offers.deliveryRadiusKm} km tak same-day delivery karte hain (${offers.sameDayCutoff} tak order). Late hua toh agla order free 🙂` },
  ],
  NOT_NOW: [
    { id: "follow_up", label: "Set a reminder, stay warm", winRate: 22, next: "FOLLOW_UP", render: ({ buyerFirstName }) => `Koi baat nahi ${buyerFirstName} ji 🙏 Main baad mein yaad dila dunga. Tab tak ek sample bhej doon taaki aap dekh lein?` },
  ],
  OWNER_UNAVAILABLE: [
    { id: "callback", label: "Ask for the owner's best time", winRate: 18, next: "FOLLOW_UP", render: () => `Theek hai ji, malik kab available honge? Main usi time call ya visit kar leta hoon.` },
  ],
  NOT_INTERESTED: [
    { id: "graceful_exit", label: "Thank and close politely", winRate: 5, next: null, render: ({ buyerFirstName }) => `Koi baat nahi ${buyerFirstName} ji, dhanyavaad 🙏 Kabhi packaging chahiye ho toh yaad kijiyega.` },
  ],
  OTHER: [
    { id: "sample_default", label: "Offer a free sample", winRate: 30, next: null, render: ({ buyerFirstName }) => `${buyerFirstName} ji, ek free sample bhej doon? Dekh kar decide kijiye 🙂` },
  ],
  SAMPLE: [
    { id: "confirm_sample", label: "Confirm sample dispatch", winRate: 100, next: "SAMPLE_DISPATCH", render: ({ buyerFirstName, understanding }) => `Done ${buyerFirstName} ji ✅ Sample kal 11 baje tak pahunch jaayega.${understanding.timing?.startsWith("Restocks") ? ` ${understanding.timing.replace(/\D+/g, "")} tareekh se pehle main yaad dila dunga 🙂` : ""}` },
  ],
  MEETING: [
    { id: "book_meeting", label: "Book a visit or call", winRate: 100, next: "MEETING", render: ({ buyerFirstName }) => `Bilkul ${buyerFirstName} ji! Kal shaam 5 baje aapki shop pe aa jaata hoon, samples ke saath. Theek rahega?` },
  ],
  ORDER: [
    { id: "payment_link", label: "Confirm order + Paytm payment link", winRate: 100, next: "PAYMENT_LINK", render: ({ buyerFirstName }) => `Order confirm ✅ Dhanyavaad ${buyerFirstName} ji! Paytm payment link bhej raha hoon. Delivery kal subah tak ho jaayegi.` },
  ],
  INFO: [
    { id: "price_list", label: "Share price list + sample", winRate: 40, next: null, render: ({ buyerFirstName, offers }) => `${buyerFirstName} ji, ye rahi price list:\n${offers.catalog.map((c) => `• ${c.name}: ${inr(c.unitPriceInr)}`).join("\n")}\nFree sample bhej doon?` },
  ],
};

/** Ranked counter plays for a reply. The first play is what Autopilot sends. */
export function choosePlays(u: ReplyUnderstanding): CounterPlay[] {
  switch (u.intent) {
    case "WANTS_SAMPLE": return PLAYS.SAMPLE;
    case "WANTS_MEETING": return PLAYS.MEETING;
    case "PLACES_ORDER": return PLAYS.ORDER;
    case "INTERESTED": case "QUESTION": return PLAYS.INFO;
    case "NOT_INTERESTED": return PLAYS.NOT_INTERESTED;
    default: return [...PLAYS[u.objection ?? "OTHER"]].sort((a, b) => b.winRate - a.winRate);
  }
}

/** Stage after the buyer's reply (before our counter). */
export function stageAfterReply(u: ReplyUnderstanding, current: string): string {
  switch (u.intent) {
    case "WANTS_SAMPLE": return "SAMPLE_REQUESTED";
    case "WANTS_MEETING": return "MEETING_BOOKED";
    case "PLACES_ORDER": return "ORDER_WON";
    case "NOT_INTERESTED": return "LOST";
    case "OBJECTION": return "OBJECTION";
    default: return current === "PITCHED" ? "REPLIED" : current;
  }
}
