import type { Lane, SignalType, StallCategory } from "@/lib/schemas";

export const MATCH_MATRIX: Record<StallCategory, Partial<Record<SignalType, number>>> = {
  BUDGET: { FUNDING: 95, HIRING_RELEVANT: 45, LEADERSHIP_CHANGE: 35, EXPANSION: 60, PRODUCT_LAUNCH: 30, COMPLIANCE_EVENT: 50, DATE_REACHED: 70, RENEWAL_WINDOW: 20, FEATURE_SHIPPED: 20 },
  TIMING: { FUNDING: 50, HIRING_RELEVANT: 45, LEADERSHIP_CHANGE: 40, EXPANSION: 45, PRODUCT_LAUNCH: 35, COMPLIANCE_EVENT: 50, DATE_REACHED: 92, RENEWAL_WINDOW: 30, FEATURE_SHIPPED: 30 },
  NO_OWNER: { FUNDING: 40, HIRING_RELEVANT: 95, LEADERSHIP_CHANGE: 85, EXPANSION: 40, PRODUCT_LAUNCH: 25, COMPLIANCE_EVENT: 55, DATE_REACHED: 50, RENEWAL_WINDOW: 20, FEATURE_SHIPPED: 20 },
  CHAMPION_LEFT: { FUNDING: 30, HIRING_RELEVANT: 55, LEADERSHIP_CHANGE: 90, EXPANSION: 25, PRODUCT_LAUNCH: 20, COMPLIANCE_EVENT: 35, DATE_REACHED: 40, RENEWAL_WINDOW: 20, FEATURE_SHIPPED: 20 },
  COMPETITOR_LOCKIN: { FUNDING: 25, HIRING_RELEVANT: 30, LEADERSHIP_CHANGE: 45, EXPANSION: 25, PRODUCT_LAUNCH: 20, COMPLIANCE_EVENT: 30, DATE_REACHED: 60, RENEWAL_WINDOW: 95, FEATURE_SHIPPED: 40 },
  MISSING_FEATURE: { FUNDING: 20, HIRING_RELEVANT: 25, LEADERSHIP_CHANGE: 25, EXPANSION: 20, PRODUCT_LAUNCH: 20, COMPLIANCE_EVENT: 40, DATE_REACHED: 30, RENEWAL_WINDOW: 20, FEATURE_SHIPPED: 95 },
  IMPLEMENTATION_EFFORT: { FUNDING: 30, HIRING_RELEVANT: 60, LEADERSHIP_CHANGE: 40, EXPANSION: 30, PRODUCT_LAUNCH: 25, COMPLIANCE_EVENT: 45, DATE_REACHED: 40, RENEWAL_WINDOW: 20, FEATURE_SHIPPED: 50 },
  INTERNAL_APPROVAL: { FUNDING: 50, HIRING_RELEVANT: 35, LEADERSHIP_CHANGE: 65, EXPANSION: 40, PRODUCT_LAUNCH: 25, COMPLIANCE_EVENT: 55, DATE_REACHED: 55, RENEWAL_WINDOW: 20, FEATURE_SHIPPED: 25 },
  WENT_DARK: { FUNDING: 50, HIRING_RELEVANT: 50, LEADERSHIP_CHANGE: 50, EXPANSION: 45, PRODUCT_LAUNCH: 40, COMPLIANCE_EVENT: 45, DATE_REACHED: 40, RENEWAL_WINDOW: 30, FEATURE_SHIPPED: 35 },
  OTHER: { FUNDING: 40, HIRING_RELEVANT: 40, LEADERSHIP_CHANGE: 40, EXPANSION: 35, PRODUCT_LAUNCH: 30, COMPLIANCE_EVENT: 40, DATE_REACHED: 50, RENEWAL_WINDOW: 30, FEATURE_SHIPPED: 30 },
};

export type MatchSignal = { id: string; type: SignalType; title: string; occurredAt: Date; provenance: string; campaign?: { events: number; sameCategory: boolean } };

/** Spec §7.5.1: campaign engagement scores by event count and whether the campaign answered this deal's objection. */
export function campaignScore(events: number, sameCategory: boolean): number {
  if (events <= 0) return 0;
  if (events === 1) return sameCategory ? 45 : 35;
  if (events === 2) return sameCategory ? 65 : 50;
  return sameCategory ? 85 : 65;
}

function baseScore(category: StallCategory, signal: MatchSignal): number {
  if (signal.type === "CAMPAIGN_ENGAGEMENT") return campaignScore(signal.campaign?.events ?? 1, signal.campaign?.sameCategory ?? false);
  return MATCH_MATRIX[category][signal.type] ?? 0;
}

export function freshness(signalDate: Date, today: Date, computed = false): number {
  if (computed) return 1;
  const age = Math.floor((today.getTime() - signalDate.getTime()) / 86_400_000);
  if (age < 0) return 0;
  if (age <= 14) return 1;
  if (age <= 45) return 0.85;
  if (age <= 90) return 0.7;
  if (age <= 180) return 0.5;
  return 0;
}

export function scoreMatch(category: StallCategory, signals: MatchSignal[], evidenceDate: Date, today: Date) {
  const scored = signals
    .filter((signal) => signal.occurredAt >= evidenceDate)
    .map((signal) => ({ signal, score: baseScore(category, signal) * freshness(signal.occurredAt, today, signal.provenance === "computed") }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { matchScore: 0, effect: "NEUTRAL" as const, best: null, freshness: 0 };
  const bonus = Math.min(12, scored.slice(1).filter(({ score }) => score >= 50).length * 6);
  const matchScore = Math.min(100, Math.round(best.score + bonus));
  const effect = matchScore >= 80 ? "REMOVES" as const : matchScore >= 50 ? "WEAKENS" as const : "NEUTRAL" as const;
  return { matchScore, effect, best: best.signal, freshness: freshness(best.signal.occurredAt, today, best.signal.provenance === "computed") };
}

export function assignLane(matchScore: number, effect: string, campaignTarget = false): Lane {
  if (matchScore >= 70 && effect !== "NEUTRAL") return "REVIVE";
  if (matchScore >= 40 || campaignTarget) return "WARM";
  return "WATCH";
}

export function valueScore(value: number, values: number[]): number {
  if (values.length <= 1) return 100;
  return Math.round(100 * values.filter((other) => other < value).length / (values.length - 1));
}

export function recommendationCopy(category: StallCategory, signal: MatchSignal, effect: "REMOVES" | "WEAKENS" | "NEUTRAL") {
  const headlines: Partial<Record<SignalType, string>> = {
    FUNDING: `${signal.title}: the budget blocker may be gone`,
    HIRING_RELEVANT: `${signal.title}: the missing owner is being hired`,
    RENEWAL_WINDOW: `${signal.title}: the renewal window is open`,
    FEATURE_SHIPPED: `${signal.title}: the exact gap they raised is closed`,
    DATE_REACHED: `${signal.title}: their stated timing has arrived`,
    EXPANSION: `${signal.title}: budget conditions may have changed`,
    LEADERSHIP_CHANGE: `${signal.title}: a new champion may be emerging`,
    CAMPAIGN_ENGAGEMENT: `${signal.title}: they engaged with the answer to their objection`,
  };
  const label = category.toLowerCase().replaceAll("_", " ");
  return {
    headline: headlines[signal.type] ?? signal.title,
    explanation: `This ${effect === "REMOVES" ? "removes" : "weakens"} the ${label} objection and gives you a specific reason to reconnect.`,
  };
}
