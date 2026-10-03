import { db } from "@/lib/db";
import { funnel, insightCallouts, learningTable } from "@/lib/engines/loop";

export async function getLoop() {
  const [outcomes, liveRecs, campaigns] = await Promise.all([
    db.outcome.findMany({ include: { deal: { select: { valueInr: true } } } }),
    db.recommendation.count({ where: { isCurrent: true } }),
    db.campaign.findMany({ where: { status: { in: ["launched", "launched_simulated"] } }, include: { engagements: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const rows = outcomes.map((row) => ({ dealId: row.dealId, stallCategory: row.stallCategory, signalType: row.signalType, event: row.event, isSeeded: row.isSeeded, valueInr: row.deal.valueInr }));
  const table = learningTable(rows);
  const campaignImpact = await Promise.all(campaigns.map(async (campaign) => {
    const targets = JSON.parse(campaign.targetAccountIdsJson) as string[];
    const engaged = [...new Set(campaign.engagements.map((event) => event.accountId))];
    const moved = campaign.launchedAt ? await db.laneChange.findMany({ where: { toLane: "REVIVE", createdAt: { gte: campaign.launchedAt }, deal: { accountId: { in: targets } } }, select: { dealId: true } }) : [];
    const influenced = await db.deal.aggregate({ where: { accountId: { in: engaged } }, _sum: { valueInr: true } });
    return { id: campaign.id, name: campaign.name, status: campaign.status, targets: targets.length, engaged: engaged.length, movedToRevive: new Set(moved.map((m) => m.dealId)).size, influencedInr: influenced._sum.valueInr ?? 0 };
  }));
  return {
    funnel: funnel(rows, liveRecs),
    table,
    callouts: insightCallouts(table),
    campaignImpact,
    liveOutcomes: outcomes.filter((row) => !row.isSeeded).length,
  };
}
