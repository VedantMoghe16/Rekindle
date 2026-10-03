import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { assignLane, recommendationCopy, scoreMatch, valueScore, type MatchSignal } from "@/lib/engines/match";
import { computeSignals, type ChangelogEntry } from "@/lib/engines/computed-signals";
import { SignalType, StallCategory, type Lane } from "@/lib/schemas";

export type LaneChangeResult = { dealId: string; accountId: string; accountName: string; fromLane: string; toLane: string; reason: string };

const CLOSED = ["won", "lost"];

export async function upsertComputedSignals(dealIds?: string[]) {
  const seller = await db.sellerProfile.findFirst();
  const changelog = seller ? JSON.parse(seller.changelogJson) as ChangelogEntry[] : [];
  const deals = await db.deal.findMany({ where: dealIds ? { id: { in: dealIds } } : undefined, include: { memory: true } });
  let added = 0;
  for (const deal of deals) {
    if (!deal.memory) continue;
    const signals = computeSignals({
      dealId: deal.id, accountId: deal.accountId,
      timing: JSON.parse(deal.memory.timingJson), competitor: JSON.parse(deal.memory.competitorJson), missingFeature: JSON.parse(deal.memory.missingFeatureJson),
    }, changelog, now());
    for (const signal of signals) {
      const existing = await db.signal.findUnique({ where: { dedupeKey: signal.dedupeKey } });
      if (existing) continue;
      await db.signal.create({ data: { id: `signal-${randomUUID()}`, accountId: signal.accountId, dealId: signal.dealId, type: signal.type, title: signal.title, detail: signal.title, sourceName: "Computed", occurredAt: signal.occurredAt, provenance: "computed", dedupeKey: signal.dedupeKey } });
      added++;
    }
  }
  return added;
}

/** Re-runnable matcher: scores every open deal against its account signals, keeps recommendation status when nothing changed, and logs lane transitions. */
export async function runMatcher(options: { dealIds?: string[] } = {}): Promise<LaneChangeResult[]> {
  const all = await db.deal.findMany({
    where: { stage: { notIn: CLOSED } },
    include: { memory: true, account: { include: { signals: true } }, recommendations: { where: { isCurrent: true } } },
  });
  const values = all.map((deal) => deal.valueInr);
  const campaigns = await db.campaign.findMany({ where: { status: { in: ["launched", "launched_simulated"] } } });
  const campaignTargets = new Set(campaigns.flatMap((campaign) => JSON.parse(campaign.targetAccountIdsJson) as string[]));
  const changes: LaneChangeResult[] = [];
  for (const deal of all) {
    if (options.dealIds && !options.dealIds.includes(deal.id)) continue;
    if (!deal.memory) continue;
    const category = StallCategory.parse(deal.memory.stallCategory);
    const signals: MatchSignal[] = deal.account.signals
      .filter((signal) => !signal.dealId || signal.dealId === deal.id)
      .map((signal) => {
        const raw = signal.rawJson ? JSON.parse(signal.rawJson) as { events?: number; campaignCategory?: string } : {};
        return {
          id: signal.id, type: SignalType.parse(signal.type), title: signal.title, occurredAt: signal.occurredAt, provenance: signal.provenance,
          campaign: signal.type === "CAMPAIGN_ENGAGEMENT" ? { events: raw.events ?? 1, sameCategory: raw.campaignCategory === category } : undefined,
        };
      });
    const scored = scoreMatch(category, signals, deal.memory.evidenceDate ?? deal.stalledAt ?? new Date(0), now());
    const isTarget = campaignTargets.has(deal.accountId);
    const lane: Lane = assignLane(scored.matchScore, scored.effect, isTarget);
    const value = valueScore(deal.valueInr, values);
    const priority = Math.round(0.7 * scored.matchScore + 0.3 * value);
    const current = deal.recommendations[0];
    const breakdown = JSON.stringify({ match: scored.matchScore, value, freshness: scored.freshness, campaignTarget: isTarget });
    if (scored.best) {
      const copy = recommendationCopy(category, scored.best, scored.effect);
      const signalIdsJson = JSON.stringify([scored.best.id]);
      if (current && current.signalIdsJson === signalIdsJson) {
        await db.recommendation.update({ where: { id: current.id }, data: { matchScore: scored.matchScore, priorityScore: priority, lane, effect: scored.effect, headline: copy.headline, explanation: copy.explanation, scoreBreakdownJson: breakdown } });
      } else {
        await db.recommendation.updateMany({ where: { dealId: deal.id, isCurrent: true }, data: { isCurrent: false } });
        await db.recommendation.create({ data: { id: `rec-${randomUUID()}`, dealId: deal.id, signalIdsJson, effect: scored.effect, matchScore: scored.matchScore, priorityScore: priority, lane, headline: copy.headline, explanation: copy.explanation, scoreBreakdownJson: breakdown } });
      }
    } else if (current) {
      await db.recommendation.updateMany({ where: { dealId: deal.id, isCurrent: true }, data: { isCurrent: false } });
    }
    if (deal.lane !== lane) {
      const reason = scored.best ? `${scored.best.title} (${scored.matchScore})` : isTarget ? "Targeted by a launched campaign" : "No qualifying signal";
      await db.laneChange.create({ data: { dealId: deal.id, fromLane: deal.lane, toLane: lane, reason } });
      changes.push({ dealId: deal.id, accountId: deal.accountId, accountName: deal.account.name, fromLane: deal.lane, toLane: lane, reason });
    }
    await db.deal.update({ where: { id: deal.id }, data: { lane, matchScore: scored.matchScore, priorityScore: priority } });
  }
  return changes;
}
