import { haversineKm, formatKm } from "@/lib/vyapar/geo";
import type { HuntPlan } from "@/lib/vyapar/planner";
import { affinity, SIGNAL_LABELS, type MerchantProfile, type MerchantSignal, type SellerOffers } from "@/lib/vyapar/taxonomy";

/**
 * Opportunity engine (VYAPAR_LEAD_ENGINE_BRIEF.md, cycle 1–2).
 * The unit is a seller–buyer–offer hypothesis, not a buyer score: "this buyer may need X because of evidence Y;
 * the seller can offer Z; try action A". Hard gates run first and can never be overridden by relevance.
 * Everything here is deterministic rules: this is NOT a trained model, and the UI must not call it one.
 */
export const RANKER_VERSION = "rules-v2";

export type EvidenceKind = "demo" | "public" | "permitted_internal" | "computed" | "buyer_stated" | "seller_stated";
export type Evidence = { claim: string; source: string; kind: EvidenceKind; observedAt: string | null; url?: string | null; private?: boolean };

export type GateId = "category" | "catalogue" | "delivery" | "chain" | "active_deal" | "opt_out" | "capacity" | "contact" | "preference";
export type GateStatus = "PASS" | "FAIL" | "UNKNOWN";
export type Gate = { id: GateId; status: GateStatus; reason: string; preferenceId?: string; blocking: boolean };

export type Angle = "STRONG_NEED" | "EXPANSION" | "CATEGORY_FIT" | "INTRO";
export type Eligibility = "eligible" | "needs_check" | "in_talks" | "excluded";

export type Opportunity = {
  merchantId: string;
  provenance: "demo" | "public";
  distanceKm: number;
  hypothesis: string;
  sku: { sku: string; name: string; unitPriceInr: number } | null;
  relevance: number;
  relevanceParts: { category: number; distance: number; capacity: number; stated: number; saved: number };
  timing: { status: "fresh" | "unknown" | "stale" | "future"; label: string; evidence: Evidence | null; ignored: string[] };
  confidence: { level: "high" | "medium" | "low"; reasons: string[] };
  contact: { status: "verified" | "unknown"; name: string | null; role: string | null; channel: "Telegram" | "Visit"; note: string };
  whyMerchant: Evidence[];
  serve: { label: string; ok: boolean | null }[];
  unknowns: string[];
  gates: Gate[];
  eligibility: Eligibility;
  excludedReason: string | null;
  angle: Angle;
  action: "pitch" | "visit" | "open_deal" | "none";
  priority: number;
  dealId: string | null;
};

export type OppMerchant = {
  id: string; name: string; ownerName: string; category: string; area: string; lat: number; lng: number;
  source: string; qrVolumeBand: string; rating: number | null; reviewCount: number | null; mcc: string;
  profile: MerchantProfile; signals: MerchantSignal[]; brand: string | null;
  contactStatus: string; contactRole: string | null; street: string | null; cuisine: string | null; openingHours: string | null; observedAt: string | null; osmId: string | null;
};
export type OppSeller = { productCategory: string; lat: number; lng: number; offers: SellerOffers };

export type SellerPrefs = {
  excludedCategories: { category: string; id: string; label: string }[];
  excludedMerchants: { merchantId: string; id: string; label: string }[];
  maxDistanceKm: { km: number; id: string; label: string } | null;
  minCapacity: { band: "Medium" | "High"; id: string; label: string } | null;
  saved: { merchantId: string; id: string }[];
  capacityAnswer: { canSupplyBulk: boolean; id: string; label: string } | null;
};
export const NO_PREFS: SellerPrefs = { excludedCategories: [], excludedMerchants: [], maxDistanceKm: null, minCapacity: null, saved: [], capacityAnswer: null };

export type OppContext = {
  activeDeals: Map<string, { id: string; stage: string }>;
  optOuts: Map<string, string>;
  buyerStated: Map<string, Evidence[]>;
};

/** Buyers that typically need 1,000+ units a month when their Paytm capacity band is high. */
const BULK_CATEGORIES = new Set(["Cloud kitchen", "Fast food", "Restaurant"]);
export const BULK_UNITS = 1000;
const BAND_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
const SIGNAL_TTL_DAYS = 45;

function dateOf(iso: string) {
  return new Date(`${iso}T12:00:00+05:30`);
}

/** Splits signals into a usable "why now" and the ones ignored (stale or future-dated), with reasons. */
export function timingFor(signals: MerchantSignal[], today: Date, provenance: "demo" | "public"): Opportunity["timing"] {
  const ignored: string[] = [];
  const fresh: MerchantSignal[] = [];
  for (const s of signals) {
    const age = (today.getTime() - dateOf(s.date).getTime()) / 86_400_000;
    if (age < 0) ignored.push(`${s.title}: dated in the future, ignored`);
    else if (age > SIGNAL_TTL_DAYS) ignored.push(`${s.title}: older than ${SIGNAL_TTL_DAYS} days, ignored`);
    else fresh.push(s);
  }
  // Public, buyer-visible events beat private aggregates for "why now" (they can also be mentioned in a pitch).
  const best = fresh.sort((a, b) => Number(Boolean(a.private)) - Number(Boolean(b.private)) || b.date.localeCompare(a.date))[0];
  if (!best) return { status: signals.length ? (ignored.some((i) => i.includes("future")) ? "future" : "stale") : "unknown", label: "Timing unknown", evidence: null, ignored };
  const kind: EvidenceKind = provenance === "public" ? "public" : best.private ? "permitted_internal" : "demo";
  return { status: "fresh", label: `${SIGNAL_LABELS[best.type] ?? best.type}: ${best.title}`, evidence: { claim: best.title, source: best.source, kind, observedAt: best.date, private: best.private }, ignored };
}

/** The most specific in-stock SKU that the seller says serves this buyer category. */
export function matchSku(offers: SellerOffers, category: string) {
  const serving = offers.catalog.filter((c) => c.servesCategories.includes(category));
  const ranked = [...serving].sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.servesCategories.length - b.servesCategories.length);
  return { sku: ranked[0] ?? null, anyServes: serving.length > 0 };
}

export function evaluateOpportunity(seller: OppSeller, plan: HuntPlan, m: OppMerchant, prefs: SellerPrefs, ctx: OppContext, today: Date): Opportunity {
  const provenance = m.source === "osm" ? "public" : "demo";
  const distanceKm = Math.round(haversineKm(seller, m) * 10) / 10;
  const fit = affinity(seller.productCategory, m.category);
  const { sku, anyServes } = matchSku(seller.offers, m.category);
  const gates: Gate[] = [];
  const unknowns: string[] = [];
  const add = (g: Gate) => gates.push(g);

  // 1. Hard eligibility gates. UNKNOWN is never PASS.
  const catPref = prefs.excludedCategories.find((p) => p.category === m.category);
  if (catPref) add({ id: "preference", status: "FAIL", reason: `You said: ${catPref.label}`, preferenceId: catPref.id, blocking: true });
  if (fit < 40) add({ id: "category", status: "FAIL", reason: `${m.category.toLowerCase()} doesn't buy ${plan.product.toLowerCase()}`, blocking: true });
  else if (!plan.categories.includes(m.category)) add({ id: "category", status: "FAIL", reason: `${m.category.toLowerCase()}, not in this search`, blocking: true });
  else add({ id: "category", status: "PASS", reason: `${m.category} buys ${plan.product.toLowerCase()}`, blocking: true });

  if (!anyServes) add({ id: "catalogue", status: "FAIL", reason: `Nothing in your catalogue serves a ${m.category.toLowerCase()}`, blocking: true });
  else if (sku && !sku.inStock) add({ id: "catalogue", status: "FAIL", reason: `${sku.name} is out of stock`, blocking: true });
  else if (sku) add({ id: "catalogue", status: "PASS", reason: `${sku.name} in stock`, blocking: true });

  const limits = [{ km: plan.radiusKm, why: `your ${plan.radiusKm} km search`, id: undefined as string | undefined }, { km: seller.offers.deliveryRadiusKm, why: `your ${seller.offers.deliveryRadiusKm} km delivery range`, id: undefined as string | undefined }];
  if (prefs.maxDistanceKm) limits.push({ km: prefs.maxDistanceKm.km, why: prefs.maxDistanceKm.label, id: prefs.maxDistanceKm.id });
  const binding = limits.sort((a, b) => a.km - b.km)[0];
  if (distanceKm > binding.km) add({ id: binding.id ? "preference" : "delivery", status: "FAIL", reason: `${formatKm(distanceKm)} away, outside ${binding.why}`, preferenceId: binding.id, blocking: true });
  else add({ id: "delivery", status: "PASS", reason: `${formatKm(distanceKm)}, within ${binding.km} km`, blocking: true });

  if (m.brand) add({ id: "chain", status: "FAIL", reason: `Chain outlet (${m.brand}) usually buys packaging centrally`, blocking: true });
  const merchantPref = prefs.excludedMerchants.find((p) => p.merchantId === m.id);
  if (merchantPref) add({ id: "preference", status: "FAIL", reason: `You skipped this merchant: ${merchantPref.label}`, preferenceId: merchantPref.id, blocking: true });
  const optOut = ctx.optOuts.get(m.id);
  if (optOut) add({ id: "opt_out", status: "FAIL", reason: optOut, blocking: true });

  // Capacity: seller-side capability vs buyer volume band. Unknown seller capacity blocks only bulk buyers.
  const band = provenance === "public" ? null : m.qrVolumeBand;
  const bulkBuyer = band === "High" && BULK_CATEGORIES.has(m.category);
  if (prefs.minCapacity && band && BAND_RANK[band] < BAND_RANK[prefs.minCapacity.band]) add({ id: "preference", status: "FAIL", reason: `You said: ${prefs.minCapacity.label}`, preferenceId: prefs.minCapacity.id, blocking: true });
  if (bulkBuyer) {
    const answer = prefs.capacityAnswer ?? (seller.offers.maxMonthlyUnitsPerBuyer != null ? { canSupplyBulk: seller.offers.maxMonthlyUnitsPerBuyer >= BULK_UNITS, id: "", label: "" } : null);
    if (!answer) { add({ id: "capacity", status: "UNKNOWN", reason: `Likely needs ${BULK_UNITS.toLocaleString("en-IN")}+ pcs a month. Can you supply that?`, blocking: true }); unknowns.push("Whether you can supply their monthly volume"); }
    else if (!answer.canSupplyBulk) add({ id: "capacity", status: "FAIL", reason: `Needs ${BULK_UNITS.toLocaleString("en-IN")}+ pcs a month; you said you can't supply that`, preferenceId: answer.id || undefined, blocking: true });
    else add({ id: "capacity", status: "PASS", reason: `You can supply ${BULK_UNITS.toLocaleString("en-IN")}+ pcs a month`, preferenceId: answer.id || undefined, blocking: true });
  } else if (!band) unknowns.push("Order size (no Paytm data for public listings)");

  const verified = m.contactStatus === "verified";
  add({ id: "contact", status: verified ? "PASS" : "UNKNOWN", reason: verified ? `${m.ownerName.split(" ")[0]} opted in to business chats` : "No verified business contact", blocking: false });
  if (!verified) unknowns.push("Who decides purchases and how to reach them");

  // 2. Typed evidence (provenance on every claim).
  const timing = timingFor(m.signals, today, provenance);
  if (timing.status !== "fresh") unknowns.push("Why now (no fresh, dated signal)");
  const stated = ctx.buyerStated.get(m.id) ?? [];
  const whyMerchant: Evidence[] = [];
  if (provenance === "public") {
    whyMerchant.push({ claim: `Listed as ${m.category.toLowerCase()}${m.street ? ` on ${m.street}` : m.area ? ` in ${m.area}` : ""}`, source: "OpenStreetMap", kind: "public", observedAt: m.observedAt, url: m.osmId ? `https://www.openstreetmap.org/${m.osmId}` : null });
    if (m.cuisine) whyMerchant.push({ claim: `Serves ${m.cuisine}`, source: "OpenStreetMap", kind: "public", observedAt: m.observedAt });
    if (m.openingHours) whyMerchant.push({ claim: `Hours: ${m.openingHours}`, source: "OpenStreetMap", kind: "public", observedAt: m.observedAt });
  } else {
    whyMerchant.push({ claim: `Registered ${m.category.toLowerCase()} in ${m.area} (MCC ${m.mcc})`, source: "Paytm profile", kind: "demo", observedAt: m.observedAt });
    const web = m.profile.sources[0];
    if (web) whyMerchant.push({ claim: `${web.rating.toFixed(1)}★ from ${web.reviews.toLocaleString("en-IN")} reviews`, source: web.source, kind: "demo", observedAt: m.observedAt });
    if (m.profile.highlights[0]) whyMerchant.push({ claim: m.profile.highlights[0], source: m.profile.instagram ? "Instagram" : web?.source ?? "Web", kind: "demo", observedAt: m.observedAt });
    if (m.profile.currentPackaging) whyMerchant.push({ claim: `Uses ${m.profile.currentPackaging} today`, source: "Web", kind: "demo", observedAt: m.observedAt });
  }
  for (const e of stated.slice(0, 2)) whyMerchant.push(e);
  whyMerchant.push({ claim: `${formatKm(distanceKm)} from you`, source: "Computed", kind: "computed", observedAt: null });

  // 3. Relevance (no "evidence points": source quality drives confidence, not likelihood).
  const category = Math.round((fit / 100) * (sku && sku.servesCategories.length <= 4 ? 50 : 42));
  const distance = Math.round(Math.max(0, 1 - distanceKm / Math.max(binding.km, 0.5)) * 20);
  const capacity = band ? ({ High: 15, Medium: 11, Low: 6 }[band] ?? 7) : 7;
  const statedPts = stated.length ? 15 : 0;
  const isSaved = prefs.saved.some((p) => p.merchantId === m.id);
  const saved = isSaved ? 10 : 0;
  const relevance = Math.min(100, category + distance + capacity + statedPts + saved);

  // 4. Confidence from source quality and verification.
  const reasons: string[] = [];
  let level: Opportunity["confidence"]["level"] = "low";
  if (stated.length) { level = "high"; reasons.push("Buyer said it themselves"); }
  else if (verified && timing.status === "fresh") { level = "high"; reasons.push("Verified contact and a fresh, dated signal"); }
  else if (verified) { level = "medium"; reasons.push("Verified contact, but no timing evidence"); }
  else if (m.street || m.openingHours || m.cuisine) { level = "medium"; reasons.push("Public listing with address or hours; need and contact unverified"); }
  else reasons.push("Only a name and category on a public map");
  if (provenance === "demo") reasons.push("Demo data: fictional merchant fixture");
  else reasons.push(`OpenStreetMap, observed ${m.observedAt ?? "recently"}`);

  // 5. What the seller can actually serve.
  const serve: Opportunity["serve"] = [];
  if (sku) serve.push({ label: `${sku.name} · ₹${sku.unitPriceInr}${sku.inStock ? " · in stock" : " · out of stock"}`, ok: sku.inStock });
  serve.push({ label: seller.offers.freeSample.enabled ? `Free sample (${seller.offers.freeSample.perWeek}/week)` : "No free samples", ok: seller.offers.freeSample.enabled });
  serve.push({ label: `Delivery ${formatKm(distanceKm)} · you cover ${Math.min(binding.km, seller.offers.deliveryRadiusKm)} km`, ok: distanceKm <= binding.km });
  serve.push({ label: `Minimum order ${seller.offers.moq} pcs`, ok: band ? true : null });
  const capGate = gates.find((g) => g.id === "capacity");
  if (capGate) serve.push({ label: capGate.reason, ok: capGate.status === "PASS" ? true : capGate.status === "FAIL" ? false : null });

  // 6. Eligibility, action, angle, hypothesis.
  const deal = ctx.activeDeals.get(m.id) ?? null;
  const fail = gates.find((g) => g.status === "FAIL");
  const blockingUnknown = gates.find((g) => g.status === "UNKNOWN" && g.blocking);
  // An active deal always stays visible as "in talks", whatever the gates say about new outreach.
  const eligibility: Eligibility = deal ? "in_talks" : fail ? "excluded" : blockingUnknown ? "needs_check" : "eligible";
  const signalType = timing.evidence && !timing.evidence.private ? m.signals.find((s) => s.title === timing.evidence!.claim)?.type : undefined;
  const angle: Angle = stated.length ? "STRONG_NEED" : signalType && ["NEW_OUTLET", "MENU_EXPANSION", "FESTIVE_SEASON"].includes(signalType) ? "EXPANSION" : "CATEGORY_FIT";
  const skuName = sku ? sku.name.replace(/\s*\(.*\)/, "").replace(/ \d+.*$/, "") : plan.product;
  const hypothesis = angle === "STRONG_NEED" ? `Answer their ask: "${stated[0].claim}"`
    : signalType === "NEW_OUTLET" ? `${skuName} sample for the new outlet`
    : signalType === "MENU_EXPANSION" ? `${skuName} for the new menu`
    : signalType === "FESTIVE_SEASON" ? `${skuName} for festive orders`
    : `${skuName} sample for a nearby ${m.category.toLowerCase()}`;
  const action: Opportunity["action"] = deal ? "open_deal" : eligibility === "excluded" ? "none" : "pitch";
  const priority = eligibility === "excluded" ? -1 : relevance + (timing.status === "fresh" ? 10 : 0);

  return {
    merchantId: m.id, provenance, distanceKm, hypothesis, sku: sku ? { sku: sku.sku, name: sku.name, unitPriceInr: sku.unitPriceInr } : null,
    relevance, relevanceParts: { category, distance, capacity, stated: statedPts, saved },
    timing, confidence: { level, reasons },
    contact: verified ? { status: "verified", name: m.ownerName, role: m.contactRole ?? "Owner", channel: "Telegram", note: "Opted in to Vyapar business chats (demo)" } : { status: "unknown", name: null, role: null, channel: "Telegram", note: "Owner not verified yet: the pitch goes to the shop's business chat (demo contact). You can also plan a visit." },
    whyMerchant, serve, unknowns, gates, eligibility, excludedReason: fail?.reason ?? null, angle, action, priority, dealId: deal?.id ?? null,
  };
}

const ELIGIBILITY_ORDER: Record<Eligibility, number> = { eligible: 0, needs_check: 1, in_talks: 2, excluded: 3 };

/** Ordering rule shown to the seller: eligible first; within a group, relevance plus 10 for a fresh, dated signal. */
export function rankOpportunities(opps: Opportunity[]): Opportunity[] {
  return [...opps].sort((a, b) => ELIGIBILITY_ORDER[a.eligibility] - ELIGIBILITY_ORDER[b.eligibility] || b.priority - a.priority || a.distanceKm - b.distanceKm);
}

/** Which preference removed or held which merchants, so the UI can explain why the list moved. */
export function preferenceImpact(opps: Opportunity[]): Map<string, string[]> {
  const impact = new Map<string, string[]>();
  for (const o of opps) if (o.eligibility === "excluded") for (const g of o.gates) if (g.preferenceId && g.status === "FAIL") impact.set(g.preferenceId, [...(impact.get(g.preferenceId) ?? []), o.merchantId]);
  return impact;
}

/** Phrases that would leak private payment intelligence or claim facts the evidence does not support. */
const PRIVATE_TERMS = /\b(payment|payments|transaction|transactions|receipts?|sales (up|badh)|revenue|turnover|qr (volume|receipts)|business badh|kamai|income)\b/i;

export function unsupportedClaims(text: string, opp: Pick<Opportunity, "timing" | "whyMerchant" | "angle">): string[] {
  const problems: string[] = [];
  if (PRIVATE_TERMS.test(text)) problems.push("Mentions the buyer's payments or sales. Private Paytm data can't be used in a pitch");
  const publicSignal = opp.timing.evidence && !opp.timing.evidence.private ? opp.timing.evidence.claim.toLowerCase() : "";
  if (/naye outlet|new outlet|second outlet|nayi branch|new branch/i.test(text) && !/outlet|branch/.test(publicSignal)) problems.push("Claims a new outlet without a public, dated source");
  if (/(\d(\.\d)?)\s*★/.test(text) && !opp.whyMerchant.some((e) => e.claim.includes("★"))) problems.push("Quotes a rating that isn't in the evidence");
  if (/diwali|festive|tyohar/i.test(text) && !/diwali|festive/i.test(publicSignal) && opp.angle === "EXPANSION") problems.push("Mentions festive demand without a public signal");
  return problems;
}
