import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { DEFAULT_CRITERIA } from "@/lib/engines/discovery";
import { DiscoveryCriteria } from "@/lib/schemas";
import { findCandidates, findCuratedCandidates, serializeCandidate } from "@/lib/services/discovery";

export const dynamic = "force-dynamic";

export async function GET() {
  const thread = await db.discoveryThread.findUnique({ where: { id: "discovery-main" }, include: { messages: { orderBy: { createdAt: "asc" } }, researchRuns: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const criteria = thread ? DiscoveryCriteria.parse(JSON.parse(thread.currentCriteriaJson)) : DEFAULT_CRITERIA;
  const lastRun = thread?.researchRuns[0];
  const candidates = !lastRun ? [] : lastRun.isDemo ? (await findCandidates(criteria)).map(serializeCandidate) : (await findCuratedCandidates(criteria)).map(serializeCandidate);
  return ok({ thread: thread ? { ...thread, criteria } : null, candidates, isDemo: lastRun?.isDemo ?? true });
}
