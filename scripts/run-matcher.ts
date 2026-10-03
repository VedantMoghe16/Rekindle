import { db } from "../src/lib/db";
import { now } from "../src/lib/clock";
import { assignLane, recommendationCopy, scoreMatch, valueScore } from "../src/lib/engines/match";
import { StallCategory, SignalType } from "../src/lib/schemas";

export async function runMatcher() {
  const deals = await db.deal.findMany({ include: { memory: true, account: { include: { signals: true } } } });
  const values = deals.map((deal) => deal.valueInr);
  for (const deal of deals) {
    if (!deal.memory) continue;
    const category = StallCategory.parse(deal.memory.stallCategory);
    const signals = deal.account.signals
      .filter((signal) => !signal.dealId || signal.dealId === deal.id)
      .map((signal) => ({ id: signal.id, type: SignalType.parse(signal.type), title: signal.title, occurredAt: signal.occurredAt, provenance: signal.provenance }));
    const scored = scoreMatch(category, signals, deal.memory.evidenceDate ?? deal.stalledAt ?? new Date(0), now());
    const lane = assignLane(scored.matchScore, scored.effect);
    const priority = Math.round(0.7 * scored.matchScore + 0.3 * valueScore(deal.valueInr, values));
    await db.recommendation.updateMany({ where: { dealId: deal.id, isCurrent: true }, data: { isCurrent: false } });
    if (scored.best) {
      const copy = recommendationCopy(category, scored.best, scored.effect);
      await db.recommendation.create({ data: {
        id: `rec-${deal.id}`,
        dealId: deal.id,
        signalIdsJson: JSON.stringify([scored.best.id]),
        effect: scored.effect,
        matchScore: scored.matchScore,
        priorityScore: priority,
        lane,
        headline: copy.headline,
        explanation: copy.explanation,
        scoreBreakdownJson: JSON.stringify({ match: scored.matchScore, value: valueScore(deal.valueInr, values), freshness: scored.freshness }),
      }});
    }
    await db.deal.update({ where: { id: deal.id }, data: { lane, matchScore: scored.matchScore, priorityScore: priority } });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMatcher().then(() => db.$disconnect());
}
