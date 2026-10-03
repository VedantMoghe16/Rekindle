import { z } from "zod";
import { formatKm } from "@/lib/vyapar/geo";
import { freshSignals } from "@/lib/vyapar/scoring";
import type { MerchantProfile, MerchantSignal, SellerOffers } from "@/lib/vyapar/taxonomy";

export const PitchDraft = z.object({
  text: z.string().min(20).max(700),
  highlights: z.array(z.string().max(60)).max(8),
  why: z.array(z.object({ tag: z.enum(["PAYTM", "WEB", "SIGNAL", "OFFER", "PUBLIC", "BUYER", "PRIVATE"]), text: z.string().max(160) })).max(6),
});
export type PitchDraft = z.infer<typeof PitchDraft>;

export type PitchContext = {
  seller: { name: string; firstName: string; area: string; product: string; unitPriceInr: number; offers: SellerOffers };
  merchant: { name: string; ownerName: string; category: string; area: string; mcc: string; qrVolumeBand: string; rating: number | null; reviewCount: number | null; profile: MerchantProfile; signals: MerchantSignal[] };
  distanceKm: number;
  language: "hinglish" | "hindi" | "english";
  today: Date;
};

export const WHATSAPP_WORD_LIMIT = 75;
export const BANNED_PHRASES = ["guaranteed", "100% guarantee", "limited time only", "act now", "best in india", "dear sir/madam"];

export function firstName(full: string) {
  return full.split(/\s+/)[0];
}

/** Template pitch used when no LLM is reachable. Specific to the buyer: distance, signal, rating, current packaging. */
export function templatePitch(ctx: PitchContext): PitchDraft {
  const { seller, merchant } = ctx;
  const name = firstName(merchant.ownerName);
  const km = formatKm(ctx.distanceKm);
  const signal = freshSignals(merchant.signals, ctx.today)[0];
  const web = merchant.profile.sources[0];
  const price = `₹${seller.unitPriceInr}`;
  const what = /bakery|sweet|cafe/i.test(merchant.category) ? "eco-friendly pastry boxes aur paper bags" : "eco-friendly food boxes aur paper bags";
  const highlights = [seller.name, `${km} door`, `${what} ${price} se`, "free sample pack"];

  const hook = signal?.type === "NEW_OUTLET"
    ? `Naye outlet ke liye badhai! 🎉 `
    : signal?.type === "FESTIVE_SEASON"
      ? `Diwali orders shuru ho gaye honge 🪔 `
      : "";
  const praise = web ? `Aapke ${web.rating.toFixed(1)}★ reviews mein log aapke ${/bakery/i.test(merchant.category) ? "pastries" : "khaane"} ki tareef karte hain. ` : "";
  if (web) highlights.push(`${web.rating.toFixed(1)}★ reviews`);

  const text = ctx.language === "english"
    ? `Hello ${name}! I'm ${seller.firstName} from ${seller.name}, just ${km} from you in ${seller.area}.\n\n${web ? `Your ${web.rating.toFixed(1)}★ reviews stand out. ` : ""}Our ${what.replace(" aur ", " and ")} start at ${price}, with same-day delivery.\n\nCan I send you a free sample pack tomorrow?`
    : `Namaste ${name} ji! 🙏\nMain ${seller.firstName}, ${seller.name} se, aapke ${merchant.category.toLowerCase()} se bas ${km} door ${seller.area} mein.\n\n${hook}${praise}Unke liye hamare ${what} ${price} se shuru hote hain, same-day delivery ke saath.\n\nKya main kal ek free sample pack bhijwa doon?`;

  return { text, highlights, why: whyThisPitch(ctx) };
}

export function whyThisPitch(ctx: PitchContext): PitchDraft["why"] {
  const { merchant } = ctx;
  const why: PitchDraft["why"] = [{ tag: "PAYTM", text: `${merchant.category} (MCC ${merchant.mcc}), ${formatKm(ctx.distanceKm)} away, ${merchant.qrVolumeBand.toLowerCase()} QR volume` }];
  const web = merchant.profile.sources[0];
  if (web) why.push({ tag: "WEB", text: `${web.rating.toFixed(1)}★ from ${web.reviews.toLocaleString("en-IN")} ${web.source} reviews${merchant.profile.highlights[0] ? `. ${merchant.profile.highlights[0]}` : ""}` });
  const signal = freshSignals(merchant.signals, ctx.today)[0];
  if (signal) why.push({ tag: "SIGNAL", text: `${signal.title} (${signal.source})` });
  if (ctx.seller.offers.freeSample.enabled) why.push({ tag: "OFFER", text: `Free sample pack: your policy allows ${ctx.seller.offers.freeSample.perWeek} a week` });
  return why;
}

/** Rejects drafts that are too long or use pushy phrases. Returns problems; empty means OK. */
export function validatePitch(text: string): string[] {
  const problems: string[] = [];
  const words = text.trim().split(/\s+/).length;
  if (words > WHATSAPP_WORD_LIMIT) problems.push(`Too long: ${words} words (max ${WHATSAPP_WORD_LIMIT})`);
  for (const phrase of BANNED_PHRASES) if (text.toLowerCase().includes(phrase)) problems.push(`Avoid "${phrase}"`);
  if (!/sample|milte|baat|call|visit|meet/i.test(text)) problems.push("Needs a clear next step (sample, call or visit)");
  return problems;
}
