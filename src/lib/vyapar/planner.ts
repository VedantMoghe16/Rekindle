import { z } from "zod";
import { CATEGORY_NAMES, MERCHANT_CATEGORIES, affinity, type MerchantCategory } from "@/lib/vyapar/taxonomy";

export const HuntPlan = z.object({
  categories: z.array(z.string()).min(1).max(6),
  radiusKm: z.number().min(0.5).max(25),
  product: z.string().min(2).max(80),
  unitPriceInr: z.number().nullable(),
  minRating: z.number().nullable(),
  onlyWithSignals: z.boolean(),
  language: z.enum(["hinglish", "hindi", "english"]),
  pitchAngle: z.string().max(160),
});
export type HuntPlan = z.infer<typeof HuntPlan>;

type SellerContext = { productCategory: string; product: string; unitPriceInr: number };

/**
 * Deterministic prompt compiler, used when no LLM is configured and to sanity-check LLM plans.
 * Understands radius ("5km", "2 kilometre"), price ("₹5", "Rs 5", "5 rupees"), category words in
 * English and Hinglish, rating floors ("4 star+") and "new"/"opened" as a buying-signal filter.
 */
export function parsePrompt(prompt: string, seller: SellerContext): HuntPlan {
  const text = prompt.toLowerCase();
  const categories = CATEGORY_NAMES.filter((name) => name !== seller.productCategory && MERCHANT_CATEGORIES[name].words.some((word) => new RegExp(`\\b${word}\\b`).test(text)));
  const fallback = CATEGORY_NAMES
    .filter((name) => affinity(seller.productCategory, name) >= 85)
    .sort((a, b) => affinity(seller.productCategory, b) - affinity(seller.productCategory, a))
    .slice(0, 3);

  const radius = text.match(/(\d+(?:\.\d+)?)\s*(?:km|kms|kilomet(?:er|re)s?)\b/);
  const price = text.match(/(?:₹|rs\.?\s*|inr\s*)(\d+(?:\.\d+)?)/) ?? text.match(/(\d+(?:\.\d+)?)\s*(?:rupees?|rupaye|rs)\b/);
  const rating = text.match(/(\d(?:\.\d)?)\s*(?:★|star|stars)/);
  const product = extractProduct(text) ?? seller.product;
  const language = /\b(hindi|हिंदी)\b/.test(text) ? "hindi" : /\benglish\b/.test(text) ? "english" : "hinglish";
  const chosen = (categories.length ? categories : fallback) as MerchantCategory[];

  return {
    categories: chosen,
    radiusKm: radius ? Math.min(25, Math.max(0.5, Number(radius[1]))) : 5,
    product,
    unitPriceInr: price ? Number(price[1]) : seller.unitPriceInr,
    minRating: rating ? Number(rating[1]) : null,
    onlyWithSignals: /\b(new|newly|opened|just opened|growing|busy)\b/.test(text),
    language,
    pitchAngle: chosen.includes("Bakery") || chosen.includes("Sweet shop")
      ? "Eco-friendly boxes that keep sweets and pastries presentable, delivered same day from nearby"
      : `Local, same-day supply of ${product} at a better price than distant wholesalers`,
  };
}

function extractProduct(text: string): string | null {
  const match = text.match(/(?:pitch|sell|offer|bechna|becho)\s+(?:my|our|mera|hamara|apne)?\s*(?:₹\s*\d+(?:\.\d+)?\s*)?([a-z][a-z\s-]{2,40}?)(?:\s+(?:to|at|for|@|in)\b|[.,!]|$)/);
  if (!match) return null;
  const words = match[1].trim().replace(/\s+/g, " ");
  return words.length >= 3 ? words.replace(/^\w/, (c) => c.toUpperCase()) : null;
}

/** Keeps an LLM plan honest: categories must exist and radius stays sane. */
export function normalisePlan(plan: HuntPlan, seller: SellerContext): HuntPlan {
  const valid = plan.categories.filter((c): c is MerchantCategory => (CATEGORY_NAMES as string[]).includes(c) && c !== seller.productCategory);
  return { ...plan, categories: valid.length ? valid : parsePrompt(plan.product, seller).categories, radiusKm: Math.min(25, Math.max(0.5, plan.radiusKm)) };
}
