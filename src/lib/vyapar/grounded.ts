import { formatKm } from "@/lib/vyapar/geo";
import { firstName, tidyGreeting, type PitchDraft } from "@/lib/vyapar/pitch";
import { unsupportedClaims, type Opportunity } from "@/lib/vyapar/opportunity";
import { rupees, type SellerOffers } from "@/lib/vyapar/taxonomy";

export type GroundedContext = {
  seller: { name: string; firstName: string; area: string; offers: SellerOffers };
  merchant: { name: string; ownerName: string; category: string; signals: { type: string; title: string; private?: boolean }[] };
  opp: Opportunity;
  language: "hinglish" | "hindi" | "english";
};

export const ANGLE_LABELS: Record<Opportunity["angle"], string> = {
  STRONG_NEED: "Answer what they asked for",
  EXPANSION: "Acknowledge a public event",
  CATEGORY_FIT: "Nearby supplier, low-commitment sample",
  INTRO: "Introduction / visit request",
};

/**
 * First message chosen by purpose (brief §Conversation strategy): one claim, one offer, one question.
 * Never mentions private payment data, never invents urgency, and asks for an introduction when the
 * decision contact is unknown.
 */
export function groundedPitch(ctx: GroundedContext): PitchDraft & { angle: Opportunity["angle"]; problems: string[] } {
  const { seller, merchant, opp } = ctx;
  const sku = opp.sku;
  const km = formatKm(opp.distanceKm);
  const price = sku ? rupees(sku.unitPriceInr) : rupees(seller.offers.catalog[0]?.unitPriceInr ?? 0);
  const product = sku ? sku.name.replace(/\s*\(.*\)/, "").replace(/ \d+.*$/, "").toLowerCase() : "packaging";
  const signal = opp.timing.evidence && !opp.timing.evidence.private ? merchant.signals.find((s) => s.title === opp.timing.evidence!.claim) : undefined;
  const rating = opp.whyMerchant.find((e) => e.claim.includes("★"));
  const name = firstName(merchant.ownerName);
  const english = ctx.language === "english";
  let text: string;
  let highlights: string[];

  if (opp.angle === "INTRO") {
    text = english
      ? `Namaste! I'm ${seller.firstName} from ${seller.name}, ${km} away in ${seller.area}. We make ${product}s from ${price} with same-day delivery.\n\nCould I drop by tomorrow with a free sample? I'd love to meet whoever handles purchases.`
      : `Namaste ji 🙏 Main ${seller.firstName}, ${seller.name} se, aapke yahan se ${km} door ${seller.area} mein. Hum ${product} ${price} se banate hain, same-day delivery ke saath.\n\nKya main kal free sample lekar aa sakta hoon? Purchase jo dekhte hain, unse milna chahunga.`;
    highlights = [km, `${product} ${price} se`, "free sample"];
  } else if (opp.angle === "STRONG_NEED") {
    const ask = opp.whyMerchant.find((e) => e.kind === "buyer_stated")?.claim ?? "";
    text = english
      ? `Hello ${name}! You mentioned: "${ask}". Our ${product}s start at ${price}, delivered same day from ${km} away.\n\nShall I send a free sample tomorrow?`
      : `Namaste ${name} ji! 🙏 Aapne kaha tha: "${ask}". Hamare ${product} ${price} se hain, ${km} door se same-day delivery.\n\nKal free sample bhej doon?`;
    highlights = [ask, `${product} ${price} se`, "free sample"];
  } else if (opp.angle === "EXPANSION" && signal) {
    const hook = signal.type === "NEW_OUTLET" ? (english ? "Congratulations on the new outlet! 🎉" : "Naye outlet ke liye badhai! 🎉")
      : signal.type === "MENU_EXPANSION" ? (english ? "Saw your new party-orders menu!" : "Aapka naya party-orders menu dekha!")
      : (english ? "Festive orders must be picking up 🪔" : "Tyohar ke orders shuru ho gaye honge 🪔");
    text = english
      ? `Hello ${name}! ${hook} I'm ${seller.firstName} from ${seller.name}, just ${km} away. Our ${product}s start at ${price}, same-day delivery.\n\nCan I send a free sample pack?`
      : `Namaste ${name} ji! ${hook}\nMain ${seller.firstName}, ${seller.name} se, bas ${km} door. Hamare ${product} ${price} se shuru, same-day delivery ke saath.\n\nKya ek free sample pack bhijwa doon?`;
    highlights = [hook, `${km} door`, `${product} ${price} se`, "free sample pack"];
  } else {
    const praise = rating ? (english ? `Your ${rating.claim.split(" from")[0]} reviews stand out. ` : `Aapke ${rating.claim.split(" from")[0]} reviews dekhe. `) : "";
    text = english
      ? `Hello ${name}! I'm ${seller.firstName} from ${seller.name}, ${km} from your ${merchant.category.toLowerCase()}. ${praise}Our ${product}s start at ${price}, same-day delivery.\n\nCan I send a free sample to try?`
      : `Namaste ${name} ji! 🙏 Main ${seller.firstName}, ${seller.name} se, aapke ${merchant.category.toLowerCase()} se ${km} door. ${praise}Hamare ${product} ${price} se shuru, same-day delivery ke saath.\n\nTry karne ke liye free sample bhej doon?`;
    highlights = [`${km} door`, `${product} ${price} se`, "free sample"];
    if (rating) highlights.push(rating.claim.split(" from")[0]);
  }

  text = tidyGreeting(text);
  const why: PitchDraft["why"] = [];
  for (const e of opp.whyMerchant.filter((x) => x.kind !== "computed").slice(0, 3)) why.push({ tag: e.kind === "public" ? "PUBLIC" : e.kind === "buyer_stated" ? "BUYER" : e.source === "Paytm profile" ? "PAYTM" : "WEB", text: `${e.claim} · ${e.source}${e.kind === "demo" ? " (demo)" : e.observedAt ? `, ${e.observedAt}` : ""}` });
  if (opp.timing.evidence) why.push({ tag: opp.timing.evidence.private ? "PRIVATE" : "SIGNAL", text: `${opp.timing.evidence.claim} · ${opp.timing.evidence.source}, ${opp.timing.evidence.observedAt}${opp.timing.evidence.private ? " (seller-only, not used in the message)" : ""}` });
  if (seller.offers.freeSample.enabled) why.push({ tag: "OFFER", text: `Free sample: ${seller.offers.freeSample.contents} (${seller.offers.freeSample.perWeek}/week)` });

  return { text, highlights: highlights.filter((h) => text.includes(h)), why: why.slice(0, 6), angle: opp.angle, problems: unsupportedClaims(text, opp) };
}
