import type { SignalType } from "@/lib/schemas";

export type ComputedInput = {
  dealId: string;
  accountId: string;
  timing: { text: string | null; resolved_date: string | null } | null;
  competitor: { name: string | null; contract_end_date: string | null } | null;
  missingFeature: { description: string | null; feature_key: string | null } | null;
};
export type ChangelogEntry = { date: string; title: string; featureKey: string };
export type ComputedSignal = { dealId: string; accountId: string; type: SignalType; title: string; occurredAt: Date; dedupeKey: string };

const DAY = 86_400_000;

export function computedDedupeKey(dealId: string, type: SignalType) {
  return `computed:${dealId}:${type.toLowerCase()}`;
}

/** Deterministic signals derived from what the buyer told us (spec §7.4.2). */
export function computeSignals(input: ComputedInput, changelog: ChangelogEntry[], today: Date): ComputedSignal[] {
  const out: ComputedSignal[] = [];
  const resolved = input.timing?.resolved_date ? new Date(`${input.timing.resolved_date}T06:30:00Z`) : null;
  if (resolved && resolved.getTime() <= today.getTime() + 7 * DAY) {
    out.push({ dealId: input.dealId, accountId: input.accountId, type: "DATE_REACHED", title: `“${input.timing?.text ?? "Their stated date"}” has arrived`, occurredAt: resolved, dedupeKey: computedDedupeKey(input.dealId, "DATE_REACHED") });
  }
  const end = input.competitor?.contract_end_date ? new Date(`${input.competitor.contract_end_date}T06:30:00Z`) : null;
  if (end) {
    const days = Math.round((end.getTime() - today.getTime()) / DAY);
    if (days <= 75 && days >= -30) {
      out.push({ dealId: input.dealId, accountId: input.accountId, type: "RENEWAL_WINDOW", title: `${input.competitor?.name ?? "Competitor"} contract ends ${end.toISOString().slice(0, 10)}`, occurredAt: today, dedupeKey: computedDedupeKey(input.dealId, "RENEWAL_WINDOW") });
    }
  }
  const key = input.missingFeature?.feature_key;
  const shipped = key ? changelog.find((entry) => entry.featureKey === key) : undefined;
  if (shipped) {
    out.push({ dealId: input.dealId, accountId: input.accountId, type: "FEATURE_SHIPPED", title: `${shipped.title} shipped`, occurredAt: new Date(`${shipped.date}T06:30:00Z`), dedupeKey: computedDedupeKey(input.dealId, "FEATURE_SHIPPED") });
  }
  return out;
}
