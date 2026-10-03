import images from "../../../data/merchant-images.json";

export type MerchantImage = { src: string; title: string; page: string; license: string; artist: string };
const MAP = images as Record<string, MerchantImage>;

/**
 * Representative category photo (Wikimedia Commons, openly licensed). Not a photo of the specific shop:
 * the UI always labels it "Representative photo" and credits the author and license.
 */
export function imageFor(category: string): MerchantImage | null {
  return MAP[category] ?? null;
}
