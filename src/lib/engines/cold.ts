/** Going-cold detection: open deals with no buyer response since the last touch. */

export type ColdInput = {
  id: string;
  stage: string;
  lane: string;
  lastTouchAt: Date | null;
  valueInr: number;
  outcomes?: { event: string; occurredAt: Date; isSeeded: boolean }[];
};

export type ColdDeal = { dealId: string; daysSilent: number; valueInr: number; nudge: string };

const OPEN_STAGES = new Set(["stalled", "active", "revived"]);
const DAY = 86_400_000;

export function nudgeText(daysSilent: number): string {
  if (daysSilent >= 90) return `${daysSilent} days silent. Reopen with what they told you last time, not a generic check-in.`;
  if (daysSilent >= 30) return `${daysSilent} days without a reply. A short, specific follow-up keeps you in the conversation.`;
  return `${daysSilent} days since the last touch. A light nudge now is cheaper than a revival later.`;
}

/** Stalled deals silent longer than `dormantAfter` are already dormant (Watch lane), so only recently stalled ones count as going cold. */
export function detectCold(deals: ColdInput[], today: Date, days = 14, dormantAfter = 90): ColdDeal[] {
  const out: ColdDeal[] = [];
  for (const deal of deals) {
    if (!OPEN_STAGES.has(deal.stage) || deal.lane === "REVIVE" || !deal.lastTouchAt) continue;
    const daysSilent = Math.floor((today.getTime() - deal.lastTouchAt.getTime()) / DAY);
    if (daysSilent <= days) continue;
    if (deal.stage === "stalled" && daysSilent > dormantAfter) continue;
    const responded = (deal.outcomes ?? []).some((outcome) => !outcome.isSeeded && (outcome.event === "replied" || outcome.event === "meeting") && outcome.occurredAt >= deal.lastTouchAt!);
    if (responded) continue;
    out.push({ dealId: deal.id, daysSilent, valueInr: deal.valueInr, nudge: nudgeText(daysSilent) });
  }
  return out.sort((a, b) => b.valueInr - a.valueInr || b.daysSilent - a.daysSilent);
}
