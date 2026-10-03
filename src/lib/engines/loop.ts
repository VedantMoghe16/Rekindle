export type OutcomeRow = { dealId: string; stallCategory: string; signalType: string | null; event: string; isSeeded: boolean; valueInr?: number };

export const FUNNEL_STAGES = ["recommended", "drafted", "sent", "replied", "meeting", "won"] as const;

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");

/** Funnel counts. "recommended" is history (every drafted outcome came from a recommendation) plus live current recommendations. */
export function funnel(outcomes: OutcomeRow[], liveRecommendations: number) {
  const count = (event: string) => outcomes.filter((row) => row.event === event).length;
  const value = (event: string) => outcomes.filter((row) => row.event === event).reduce((sum, row) => sum + (row.valueInr ?? 0), 0);
  return FUNNEL_STAGES.map((stage) => ({
    stage,
    count: stage === "recommended" ? count("drafted") + liveRecommendations : count(stage),
    valueInr: stage === "recommended" ? value("drafted") : value(stage),
  }));
}

export type LearningRow = { stallCategory: string; signalType: string; sent: number; replied: number; meetings: number; won: number; replyRate: number; meetingRate: number };

/** Which stall reason × signal combinations actually reopen deals. Sorted by reply rate, then volume. */
export function learningTable(outcomes: OutcomeRow[]): LearningRow[] {
  const groups = new Map<string, LearningRow>();
  for (const row of outcomes) {
    if (!row.signalType) continue;
    const key = `${row.stallCategory}|${row.signalType}`;
    const entry = groups.get(key) ?? { stallCategory: row.stallCategory, signalType: row.signalType, sent: 0, replied: 0, meetings: 0, won: 0, replyRate: 0, meetingRate: 0 };
    if (row.event === "sent") entry.sent++;
    if (row.event === "replied") entry.replied++;
    if (row.event === "meeting") entry.meetings++;
    if (row.event === "won") entry.won++;
    groups.set(key, entry);
  }
  return [...groups.values()]
    .filter((row) => row.sent > 0)
    .map((row) => ({ ...row, replyRate: Math.round((100 * row.replied) / row.sent), meetingRate: Math.round((100 * row.meetings) / row.sent) }))
    .sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent);
}

/** Templated insight callouts from the learning table. */
export function insightCallouts(rows: LearningRow[]): string[] {
  const out: string[] = [];
  const best = rows[0];
  if (best) out.push(`${capitalize(label(best.stallCategory))} objections reopen best after ${label(best.signalType)}: ${best.replyRate}% reply rate.`);
  const worst = rows.at(-1);
  if (worst && worst !== best) out.push(`${capitalize(label(worst.stallCategory))} deals rarely come back (${worst.replyRate}% reply). Deprioritise them unless a new signal lands.`);
  const campaign = rows.find((row) => row.signalType === "CAMPAIGN_ENGAGEMENT");
  if (campaign) out.push(`Accounts that engage with an objection campaign reply ${campaign.replyRate}% of the time, so marketing is creating sales moments.`);
  return out;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
