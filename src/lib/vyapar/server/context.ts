import type { Merchant } from "@prisma/client";
import { db } from "@/lib/db";
import { cogneeAdd, cogneeCognify, isCogneeConfigured } from "@/lib/providers/cognee";
import { SellerOffers, type MerchantProfile, type MerchantSignal } from "@/lib/vyapar/taxonomy";

export type MerchantView = Omit<Merchant, "profileJson" | "signalsJson"> & { profile: MerchantProfile; signals: MerchantSignal[] };

export function viewMerchant(m: Merchant): MerchantView {
  const { profileJson, signalsJson, ...rest } = m;
  return { ...rest, profile: JSON.parse(profileJson) as MerchantProfile, signals: JSON.parse(signalsJson) as MerchantSignal[] };
}

export async function getSeller() {
  const seller = await db.vyaparSeller.findFirst({ include: { merchant: true } });
  if (!seller) throw new Error("Vyapar AI is not set up. Run npm run demo:reset.");
  return { ...seller, merchant: viewMerchant(seller.merchant), offers: SellerOffers.parse(JSON.parse(seller.offersJson)) };
}
export type SellerView = Awaited<ReturnType<typeof getSeller>>;

/** Rough monthly order value for a buyer, from Paytm QR volume band and the seller's price. */
export function estimateValue(qrVolumeBand: string, unitPriceInr: number): number {
  const bags = { High: 1500, Medium: 1000, Low: 600 }[qrVolumeBand] ?? 800;
  return Math.round((bags * unitPriceInr) / 100) * 100;
}

/** Best-effort Cognee memory write. Never blocks or fails the user's action. */
export function remember(docs: { id: string; text: string }[]) {
  if (!isCogneeConfigured() || !docs.length) return;
  void cogneeAdd(docs).then(() => cogneeCognify()).catch((error) => console.warn(`[vyapar] Cognee write failed: ${error instanceof Error ? error.message : error}`));
}

export function shortRef(prefix = "VY") {
  return `${prefix}-${Math.floor(2300 + Math.random() * 7000)}`;
}

/**
 * Demo-aware wall clock: the DEMO_TODAY date with the real time of day, so live activity sorts after
 * seeded history and still advances second by second. Without DEMO_TODAY it is simply the real time.
 */
export function liveNow(): Date {
  const frozen = process.env.DEMO_TODAY;
  if (!frozen) return new Date();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date());
  return new Date(`${frozen}T${time}.${String(new Date().getMilliseconds()).padStart(3, "0")}+05:30`);
}
