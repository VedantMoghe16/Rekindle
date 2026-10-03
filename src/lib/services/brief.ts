import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { detectCold } from "@/lib/engines/cold";

export async function getBrief() {
  const today = now();
  const deals = await db.deal.findMany({
    where: { stage: { in: ["stalled", "active", "revived"] } },
    include: {
      account: { include: { signals: { orderBy: { occurredAt: "desc" } }, contacts: true } },
      memory: true,
      recommendations: { where: { isCurrent: true }, take: 1 },
      interactions: { orderBy: { occurredAt: "desc" }, take: 1, select: { channel: true, occurredAt: true } },
      outcomes: { where: { isSeeded: false }, select: { event: true, occurredAt: true, isSeeded: true } },
    },
  });
  const hidden = (deal: (typeof deals)[number]) => {
    const rec = deal.recommendations[0];
    if (!rec) return false;
    if (rec.status === "dismissed" || rec.status === "sent") return true;
    return rec.status === "snoozed" && (!rec.snoozedUntil || rec.snoozedUntil > today);
  };
  const active = deals.filter((deal) => !hidden(deal));
  const totalValue = deals.reduce((sum, deal) => sum + deal.valueInr, 0);
  const revive = active.filter((deal) => deal.lane === "REVIVE").sort((a, b) => b.priorityScore - a.priorityScore || b.matchScore - a.matchScore || b.valueInr - a.valueInr || a.account.name.localeCompare(b.account.name));
  const warm = active.filter((deal) => deal.lane === "WARM");
  const watch = active.filter((deal) => deal.lane === "WATCH");
  const done = deals.filter((deal) => deal.recommendations[0]?.status === "sent");
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  const signalsThisWeek = deals.flatMap((deal) => deal.account.signals).filter((signal) => signal.occurredAt >= weekAgo);
  const byId = new Map(deals.map((deal) => [deal.id, deal]));
  const cold = detectCold(deals, today).map((item) => {
    const deal = byId.get(item.dealId)!;
    const rec = deal.recommendations[0];
    return {
      ...item, accountId: deal.accountId, accountName: deal.account.name, industry: deal.account.industry, lane: deal.lane,
      lastChannel: deal.interactions[0]?.channel ?? null, stallCategory: deal.memory?.stallCategory ?? null,
      recommendationId: rec && rec.status !== "dismissed" ? rec.id : null,
    };
  });
  return {
    totalValue, stalledCount: deals.length, revive, warm, watch, done, cold,
    coldValue: cold.reduce((sum, item) => sum + item.valueInr, 0),
    reviveValue: revive.reduce((sum, deal) => sum + deal.valueInr, 0),
    signalsThisWeek: signalsThisWeek.length,
    liveSignalsThisWeek: signalsThisWeek.filter((signal) => signal.provenance === "live").length,
  };
}
