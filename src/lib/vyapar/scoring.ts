import { haversineKm, formatKm } from "@/lib/vyapar/geo";
import type { HuntPlan } from "@/lib/vyapar/planner";
import { affinity, SIGNAL_LABELS, type MerchantProfile, type MerchantSignal, type Reason } from "@/lib/vyapar/taxonomy";

export type ScoringMerchant = {
  id: string; name: string; category: string; lat: number; lng: number;
  qrVolumeBand: string; rating: number | null; reviewCount: number | null;
  profile: MerchantProfile; signals: MerchantSignal[];
};
export type ScoringSeller = { productCategory: string; lat: number; lng: number };

export type ScoreBreakdown = {
  relevance: number;
  proximity: number;
  capacity: number;
  timing: number;
  evidence: number;
  total: number;
};

export type LeadScore = {
  merchantId: string;
  fitScore: number;
  distanceKm: number;
  reasons: Reason[];
  breakdown: ScoreBreakdown;
  excluded: string | null;
};

const QR_POINTS: Record<string, number> = { High: 10, Medium: 6, Low: 2 };

/** Signals older than 45 days stop counting as buying signals. */
export function freshSignals(signals: MerchantSignal[], today: Date): MerchantSignal[] {
  return signals.filter((s) => {
    const age = (today.getTime() - new Date(`${s.date}T12:00:00+05:30`).getTime()) / 86_400_000;
    return age >= 0 && age <= 45;
  });
}

/**
 * Priority score (0–100) for one merchant against a hunt plan.
 * Relevance and capacity keep the list commercially useful; timing makes a
 * current buying signal beat a merely nearby account; evidence is a confidence
 * check so a sparse profile cannot silently outrank a well-supported one.
 * Merchants outside the radius, in a category the plan did not ask for, or below the rating floor are
 * kept with an `excluded` reason so the UI can explain what was skipped.
 */
export function scoreMerchant(seller: ScoringSeller, plan: HuntPlan, merchant: ScoringMerchant, today: Date): LeadScore {
  const distanceKm = Math.round(haversineKm(seller, merchant) * 10) / 10;
  const fit = affinity(seller.productCategory, merchant.category);
  const signals = freshSignals(merchant.signals, today);
  const reasons: Reason[] = [];

  let excluded: string | null = null;
  if (!plan.categories.includes(merchant.category)) excluded = fit < 40 ? `${merchant.category.toLowerCase()}, doesn't buy ${plan.product.toLowerCase()}` : `${merchant.category.toLowerCase()}, not in your list`;
  else if (distanceKm > plan.radiusKm) excluded = `${formatKm(distanceKm)} away, outside your ${plan.radiusKm} km radius`;
  else if (plan.minRating && (merchant.rating ?? 0) < plan.minRating) excluded = `rated ${merchant.rating ?? "n/a"}, below ${plan.minRating}★`;
  else if (plan.onlyWithSignals && signals.length === 0) excluded = "no recent buying signal";

  const relevance = Math.round((fit / 100) * 35);
  const proximity = Math.round(Math.max(0, 1 - distanceKm / Math.max(plan.radiusKm, 0.5)) * 15);
  const capacity = QR_POINTS[merchant.qrVolumeBand] ? Math.round((QR_POINTS[merchant.qrVolumeBand] / 10) * 15) : 0;
  const timing = Math.min(20, signals.length * 14 + (signals.length > 1 ? 6 : 0));
  const profileEvidence = Math.min(10, merchant.profile.sources.length * 4 + merchant.profile.highlights.length * 2 + (merchant.profile.currentPackaging ? 2 : 0));
  const ratingEvidence = merchant.rating ? Math.round(Math.max(0, Math.min(5, (merchant.rating - 3.5) * 5))) : 0;
  const evidence = Math.min(15, profileEvidence + ratingEvidence);
  const total = Math.min(100, relevance + proximity + capacity + timing + evidence);
  const breakdown: ScoreBreakdown = { relevance, proximity, capacity, timing, evidence, total };

  for (const s of signals) reasons.push({ text: s.title, source: s.source, kind: "signal" });
  const web = merchant.profile.sources[0];
  if (web) reasons.push({ text: `${web.rating.toFixed(1)}★ from ${compact(web.reviews)} reviews`, source: web.source, kind: "web" });
  for (const h of merchant.profile.highlights.slice(0, 1)) reasons.push({ text: h, source: merchant.profile.instagram ? "Instagram" : web?.source ?? "Web", kind: "web" });
  if (merchant.profile.currentPackaging) reasons.push({ text: `Uses ${merchant.profile.currentPackaging} today`, source: "Web", kind: "web" });
  reasons.push({ text: `${merchant.category} · ${formatKm(distanceKm)} · QR volume ${merchant.qrVolumeBand.toLowerCase()}`, source: "Paytm", kind: "paytm" });

  return { merchantId: merchant.id, fitScore: total, distanceKm, reasons: reasons.slice(0, 4), breakdown, excluded };
}

export function rankLeads(scores: LeadScore[]): LeadScore[] {
  return [...scores].sort((a, b) => Number(Boolean(a.excluded)) - Number(Boolean(b.excluded)) || b.fitScore - a.fitScore || a.distanceKm - b.distanceKm);
}

export function topSignalLabel(signals: MerchantSignal[], today: Date): string | null {
  const s = freshSignals(signals, today)[0];
  return s ? SIGNAL_LABELS[s.type] ?? s.type : null;
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}
