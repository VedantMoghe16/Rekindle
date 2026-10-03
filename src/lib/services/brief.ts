import { db } from "@/lib/db";
import { now } from "@/lib/clock";

export async function getBrief() {
  const deals = await db.deal.findMany({
    where: { stage: "stalled" },
    include: {
      account: { include: { signals: { orderBy: { occurredAt: "desc" } }, contacts: true } },
      memory: true,
      recommendations: { where: { isCurrent: true }, take: 1 },
    },
  });
  const active = deals.filter((deal) => deal.recommendations[0]?.status !== "snoozed" && deal.recommendations[0]?.status !== "dismissed");
  const totalValue = deals.reduce((sum, deal) => sum + deal.valueInr, 0);
  const revive = active.filter((deal) => deal.lane === "REVIVE").sort((a, b) => b.priorityScore - a.priorityScore || b.matchScore - a.matchScore || b.valueInr - a.valueInr || a.account.name.localeCompare(b.account.name));
  const warm = active.filter((deal) => deal.lane === "WARM");
  const watch = active.filter((deal) => deal.lane === "WATCH");
  const weekAgo = new Date(now().getTime() - 7 * 86_400_000);
  const signalsThisWeek = deals.flatMap((deal) => deal.account.signals).filter((signal) => signal.occurredAt >= weekAgo);
  return {
    totalValue, stalledCount: deals.length, revive, warm, watch,
    reviveValue: revive.reduce((sum, deal) => sum + deal.valueInr, 0),
    signalsThisWeek: signalsThisWeek.length,
    liveSignalsThisWeek: signalsThisWeek.filter((signal) => signal.provenance === "live").length,
  };
}
