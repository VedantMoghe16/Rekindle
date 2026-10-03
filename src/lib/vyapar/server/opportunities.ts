import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { radarPosition } from "@/lib/vyapar/geo";
import { evaluateOpportunity, preferenceImpact, rankOpportunities, RANKER_VERSION, type Evidence, type OppContext, type OppMerchant, type Opportunity } from "@/lib/vyapar/opportunity";
import { buildPrefs, type PreferenceRow } from "@/lib/vyapar/preferences";
import type { HuntPlan } from "@/lib/vyapar/planner";
import { getSeller, liveNow, viewMerchant, type MerchantView, type SellerView } from "@/lib/vyapar/server/context";

const CLOSED = ["ORDER_WON", "LOST"];

export function toOppMerchant(m: MerchantView): OppMerchant {
  return {
    id: m.id, name: m.name, ownerName: m.ownerName, category: m.category, area: m.area, lat: m.lat, lng: m.lng, source: m.source,
    qrVolumeBand: m.qrVolumeBand, rating: m.rating, reviewCount: m.reviewCount, mcc: m.mcc, profile: m.profile, signals: m.signals,
    brand: m.brand, contactStatus: m.contactStatus, contactRole: m.contactRole, street: m.street, cuisine: m.cuisine, openingHours: m.openingHours, observedAt: m.observedAt, osmId: m.osmId,
  };
}

export async function loadPreferenceRows(sellerId: string): Promise<(PreferenceRow & { createdAt: Date })[]> {
  return db.vyaparPreference.findMany({ where: { sellerId }, orderBy: { createdAt: "asc" } });
}

/** Deals, opt-outs and buyer-stated needs that the opportunity gates depend on. */
export async function loadContext(): Promise<OppContext> {
  const deals = await db.vyaparDeal.findMany({ include: { memories: true }, orderBy: { createdAt: "desc" } });
  const activeDeals = new Map<string, { id: string; stage: string }>();
  const optOuts = new Map<string, string>();
  const buyerStated = new Map<string, Evidence[]>();
  for (const d of deals) {
    if (!CLOSED.includes(d.stage) && !activeDeals.has(d.merchantId)) activeDeals.set(d.merchantId, { id: d.id, stage: d.stage });
    const refusal = d.memories.find((m) => m.category === "NOT_INTERESTED");
    if (d.stage === "LOST" && refusal) optOuts.set(d.merchantId, `Said not interested on ${refusal.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`);
    for (const m of d.memories.filter((x) => x.kind === "PREFERENCE" && x.quote)) {
      buyerStated.set(d.merchantId, [...(buyerStated.get(d.merchantId) ?? []), { claim: m.quote!, source: "Buyer said on Telegram", kind: "buyer_stated", observedAt: m.createdAt.toISOString().slice(0, 10) }]);
    }
  }
  return { activeDeals, optOuts, buyerStated };
}

export async function evaluateMerchants(seller: SellerView, plan: HuntPlan, merchants: MerchantView[]) {
  const [rows, ctx] = await Promise.all([loadPreferenceRows(seller.id), loadContext()]);
  const prefs = buildPrefs(rows);
  const oppSeller = { productCategory: seller.productCategory, lat: seller.merchant.lat, lng: seller.merchant.lng, offers: seller.offers };
  const opps = rankOpportunities(merchants.map((m) => evaluateOpportunity(oppSeller, plan, toOppMerchant(m), prefs, ctx, now())));
  return { opps, rows, prefs };
}

export async function logEvent(e: { sellerId: string; type: string; huntId?: string | null; leadId?: string | null; merchantId?: string | null; dealId?: string | null; position?: number | null; provenance?: "simulated" | "demo" | "live"; meta?: Record<string, unknown> }) {
  await db.vyaparEvent.create({ data: { sellerId: e.sellerId, type: e.type, huntId: e.huntId ?? null, leadId: e.leadId ?? null, merchantId: e.merchantId ?? null, dealId: e.dealId ?? null, position: e.position ?? null, rankerVersion: RANKER_VERSION, provenance: e.provenance ?? "simulated", metaJson: JSON.stringify(e.meta ?? {}), createdAt: liveNow() } });
}

/**
 * Persists a hunt's candidates with a frozen opportunity snapshot (never rewritten later) and logs what was shown.
 * Stored: every merchant in the requested categories (so undoing feedback can bring them back) plus a few
 * informative exclusions (out of range, chains, wrong category).
 */
export async function persistHuntLeads(huntId: string, seller: SellerView, plan: HuntPlan, merchants: MerchantView[]) {
  const { opps } = await evaluateMerchants(seller, plan, merchants);
  const byId = new Map(merchants.map((m) => [m.id, m]));
  const inScope = opps.filter((o) => plan.categories.includes(byId.get(o.merchantId)!.category));
  const decoys = opps.filter((o) => o.eligibility === "excluded" && !plan.categories.includes(byId.get(o.merchantId)!.category)).sort((a, b) => Number(Boolean(byId.get(b.merchantId)!.brand)) - Number(Boolean(byId.get(a.merchantId)!.brand)) || a.relevance - b.relevance).slice(0, 3);
  const keep = [...inScope, ...decoys];
  let position = 0;
  await db.vyaparLead.createMany({
    data: keep.map((o) => ({
      huntId, merchantId: o.merchantId, fitScore: o.relevance, distanceKm: o.distanceKm, reasonsJson: JSON.stringify({ reasons: o.whyMerchant.map((e) => ({ text: e.claim, source: e.source, kind: e.kind })) }),
      excluded: o.excludedReason, status: o.eligibility === "excluded" ? "EXCLUDED" : o.eligibility === "in_talks" ? "IN_TALKS" : "SUGGESTED", dealId: o.dealId,
      opportunityJson: JSON.stringify(o), position: o.eligibility === "eligible" ? ++position : null, rankerVersion: RANKER_VERSION,
    })),
  });
  const shown = keep.filter((o) => o.eligibility === "eligible").slice(0, 12);
  await db.vyaparEvent.createMany({ data: shown.map((o, i) => ({ sellerId: seller.id, type: "EXPOSED", huntId, merchantId: o.merchantId, position: i + 1, rankerVersion: RANKER_VERSION, provenance: o.provenance === "demo" ? "demo" : "simulated", metaJson: JSON.stringify({ relevance: o.relevance, timing: o.timing.status, confidence: o.confidence.level }), createdAt: liveNow() })) });
  return { scanned: merchants.length, eligible: position };
}

export type HuntLead = { id: string; status: string; dealId: string | null; merchant: MerchantView; opp: Opportunity; snapshot: Opportunity | null; pos: { x: number; y: number } };

/** Live view of a hunt: snapshot candidates re-evaluated with the seller's current feedback. */
export async function evaluateHunt(huntId: string, plan: HuntPlan) {
  const seller = await getSeller();
  const leads = await db.vyaparLead.findMany({ where: { huntId }, include: { merchant: true } });
  const merchants = leads.map((l) => viewMerchant(l.merchant));
  const { opps, rows } = await evaluateMerchants(seller, plan, merchants);
  const leadByMerchant = new Map(leads.map((l) => [l.merchantId, l]));
  const items: HuntLead[] = opps.map((opp) => {
    const lead = leadByMerchant.get(opp.merchantId)!;
    const merchant = merchants.find((m) => m.id === opp.merchantId)!;
    const status = lead.status === "SKIPPED" && opp.eligibility !== "excluded" ? "SUGGESTED" : lead.status;
    return { id: lead.id, status, dealId: opp.dealId ?? lead.dealId, merchant, opp, snapshot: lead.opportunityJson ? (JSON.parse(lead.opportunityJson) as Opportunity) : null, pos: radarPosition(seller.merchant, merchant, plan.radiusKm) };
  });
  const impact = preferenceImpact(opps);
  const active = rows.filter((r) => r.active).map((r) => ({ id: r.id, kind: r.kind, label: r.label, reason: r.reason, affected: impact.get(r.id)?.length ?? 0, merchantNames: (impact.get(r.id) ?? []).slice(0, 3).map((id) => merchants.find((m) => m.id === id)?.name ?? id) }));
  const moved = items.filter((i) => i.snapshot && i.snapshot.eligibility !== i.opp.eligibility).length;
  const held = items.filter((i) => i.opp.eligibility === "needs_check" && i.opp.gates.some((g) => g.id === "capacity" && g.status === "UNKNOWN"));
  const needsCapacity = held.length > 0;
  return {
    seller,
    shortlist: items.filter((i) => i.opp.eligibility === "eligible"),
    needsCheck: items.filter((i) => i.opp.eligibility === "needs_check"),
    inTalks: items.filter((i) => i.opp.eligibility === "in_talks"),
    excluded: items.filter((i) => i.opp.eligibility === "excluded"),
    preferences: active,
    moved,
    clarification: needsCapacity ? { question: `Can you supply 1,000+ pcs a month to a single buyer?`, why: `${held.length} high-volume buyer${held.length === 1 ? " is" : "s are"} on hold until you answer: ${held.map((i) => i.merchant.name).join(", ")}.` } : null,
  };
}

/** What a future learned ranker could train on today. Fictional or simulated events never count as labels. */
export async function learningReadiness() {
  const events = await db.vyaparEvent.findMany({ select: { type: true, provenance: true } });
  const count = (types: string[], provenance?: string) => events.filter((e) => types.includes(e.type) && (!provenance || e.provenance === provenance)).length;
  const POSITIVE = ["POSITIVE_REPLY", "SAMPLE_REQUESTED", "MEETING_BOOKED"];
  return {
    ranker: RANKER_VERSION,
    exposures: count(["EXPOSED"]),
    sellerActions: count(["SAVED", "SKIPPED", "CLARIFIED", "PREF_UNDONE", "VISIT_PLANNED", "DRAFT_EDITED", "APPROVED_SENT"]),
    simulatedOutcomes: count([...POSITIVE, "REPLY_RECEIVED", "ORDER_WON", "NOT_INTERESTED"], "simulated"),
    realDeliveredContacts: count(["MESSAGE_DELIVERED"], "live"),
    realLabels: count(POSITIVE, "live"),
    minimumForTraining: 200,
  };
}

/** Leads the seller chose to visit because no verified contact exists (nearest first). */
export async function visitRoute() {
  const seller = await getSeller();
  const leads = await db.vyaparLead.findMany({ where: { status: "VISIT_PLANNED" }, include: { merchant: true }, orderBy: { distanceKm: "asc" } });
  const seen = new Set<string>();
  return leads.filter((l) => !seen.has(l.merchantId) && seen.add(l.merchantId)).map((l) => ({ leadId: l.id, merchantId: l.merchantId, name: l.merchant.name, category: l.merchant.category, street: l.merchant.street ?? l.merchant.area, distanceKm: l.distanceKm, osmId: l.merchant.osmId, sellerArea: seller.merchant.area }));
}
