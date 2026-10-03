import { persona } from "@/lib/vyapar/persona";
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
  return { ...seller, merchant: viewMerchant(seller.merchant), offers: SellerOffers.parse(JSON.parse(seller.offersJson)), persona: persona(seller.ownerGender) };
}
export type SellerView = Awaited<ReturnType<typeof getSeller>>;

/** Rough monthly order value for a buyer, from Paytm QR volume band and the seller's price. */
export function estimateValue(qrVolumeBand: string, unitPriceInr: number): number {
  const bags = { High: 1500, Medium: 1000, Low: 600 }[qrVolumeBand] ?? 800;
  return Math.round((bags * unitPriceInr) / 100) * 100;
}

const KIND_BY_PREFIX: Record<string, { kind: string; label: string }> = {
  pitch: { kind: "PITCH", label: "Pitch sent" }, reply: { kind: "REPLY", label: "Buyer replied" }, call: { kind: "CALL", label: "AI call result" },
  need: { kind: "NEED", label: "Buyer need posted" }, fleet: { kind: "FLEET", label: "AI sales team run" }, onboarding: { kind: "BUSINESS", label: "Business profile" },
};

/**
 * Business memory write: every fact is saved as a plain-language KnowledgeEvent (the database record people see)
 * and sent to Cognee for the knowledge graph. Never blocks or fails the user's action.
 */
export function remember(docs: { id: string; text: string; title?: string; dealId?: string; runId?: string }[]) {
  if (!docs.length) return;
  void (async () => {
    const rows = await Promise.all(docs.map((d) => {
      const meta = KIND_BY_PREFIX[d.id.split("-")[0]] ?? { kind: "NOTE", label: "Note" };
      return db.knowledgeEvent.create({ data: { kind: meta.kind, title: d.title ?? meta.label, text: d.text, dealId: d.dealId ?? null, runId: d.runId ?? null, cognee: isCogneeConfigured() ? "pending" : "skipped", createdAt: liveNow() } });
    }));
    if (!isCogneeConfigured()) return;
    try {
      await cogneeAdd(docs.map((d) => ({ id: d.id, text: d.text })));
      await cogneeCognify();
      await db.knowledgeEvent.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { cognee: "saved" } });
    } catch (error) {
      console.warn(`[vyapar] Cognee write failed: ${error instanceof Error ? error.message : error}`);
      await db.knowledgeEvent.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { cognee: "failed" } });
    }
  })().catch((error) => console.warn(`[vyapar] memory write failed: ${error instanceof Error ? error.message : error}`));
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
