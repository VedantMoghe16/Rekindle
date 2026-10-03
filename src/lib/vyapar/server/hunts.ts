import { db } from "@/lib/db";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { HuntPlan, normalisePlan, parsePrompt } from "@/lib/vyapar/planner";
import type { scoreMerchant } from "@/lib/vyapar/scoring";
import { CATEGORY_NAMES, type Reason } from "@/lib/vyapar/taxonomy";
import { getSeller, viewMerchant } from "@/lib/vyapar/server/context";
import { evaluateHunt, persistHuntLeads } from "@/lib/vyapar/server/opportunities";

type StoredLeadEvidence = { reasons: Reason[]; breakdown?: ReturnType<typeof scoreMerchant>["breakdown"] };

function parseLeadEvidence(raw: string): StoredLeadEvidence {
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) return { reasons: parsed as Reason[] };
  if (parsed && typeof parsed === "object" && "reasons" in parsed && Array.isArray(parsed.reasons)) {
    return parsed as StoredLeadEvidence;
  }
  return { reasons: [] };
}

const PLAN_SYSTEM = `You turn a small Indian merchant's request (English, Hindi or Hinglish) into a search plan over nearby Paytm merchants.
categories must be chosen only from: ${CATEGORY_NAMES.join(", ")}.
radiusKm defaults to 5 when not stated. unitPriceInr is the price the seller mentioned, else null.
minRating only when the seller asks for a rating floor. onlyWithSignals is true only when they ask for new, newly opened or growing shops.
language is the language the pitch should use (default hinglish). pitchAngle is one sentence on why these buyers need the product.`;

export async function createHunt(prompt: string) {
  const seller = await getSeller();
  const ctx = { productCategory: seller.productCategory, product: seller.product, unitPriceInr: seller.unitPriceInr };
  let plan = parsePrompt(prompt, ctx);
  let provenance = "rules";
  try {
    const result = await callStructured({ tier: "fast", schema: HuntPlan, schemaName: "VyaparHuntPlan", system: PLAN_SYSTEM, user: `Seller: ${seller.merchant.name} (${seller.productCategory}), sells ${seller.product} from ₹${seller.unitPriceInr}.\nRequest: ${prompt}` });
    plan = normalisePlan(result.data, ctx);
    provenance = result.provenance === "live" ? (result.provider === "anthropic" ? "claude" : result.provider) : "cached";
  } catch (error) {
    if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] plan via LLM failed, using rules: ${error instanceof Error ? error.message : error}`);
  }

  // Other suppliers in the seller's own category are competitors, not buyers.
  const merchants = (await db.merchant.findMany({ where: { id: { not: seller.merchantId }, category: { not: seller.productCategory } } })).map(viewMerchant);
  const hunt = await db.vyaparHunt.create({ data: { prompt, planJson: JSON.stringify(plan), provenance, scanned: merchants.length } });
  await persistHuntLeads(hunt.id, seller, plan, merchants);
  return hunt.id;
}

export async function getHunt(id: string) {
  const hunt = await db.vyaparHunt.findUnique({ where: { id } });
  if (!hunt) return null;
  const plan = HuntPlan.parse(JSON.parse(hunt.planJson));
  const live = await evaluateHunt(id, plan);
  return { id: hunt.id, prompt: hunt.prompt, plan, provenance: hunt.provenance, scanned: hunt.scanned, createdAt: hunt.createdAt, ...live };
}
export type HuntView = NonNullable<Awaited<ReturnType<typeof getHunt>>>;

export async function recentHunts(limit = 3) {
  const hunts = await db.vyaparHunt.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { _count: { select: { leads: { where: { status: { not: "EXCLUDED" } } } } } } });
  return hunts.map((h) => ({ id: h.id, prompt: h.prompt, leads: h._count.leads, createdAt: h.createdAt }));
}
