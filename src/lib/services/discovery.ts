import { db } from "@/lib/db";
import { candidateMatches, criteriaSummary } from "@/lib/engines/discovery";
import type { DiscoveryCriteria } from "@/lib/schemas";

export async function findCandidates(criteria: DiscoveryCriteria) {
  const candidates = await db.leadCandidate.findMany({ include: { evidence: { orderBy: { observedAt: "desc" } } }, orderBy: [{ overallScore: "desc" }, { name: "asc" }] });
  return candidates.filter((candidate) => candidateMatches(candidate, criteria));
}

export function serializeCandidate(candidate: Awaited<ReturnType<typeof findCandidates>>[number]) {
  return { ...candidate, whyFit: JSON.parse(candidate.whyFitJson) as string[], tags: JSON.parse(candidate.tagsJson) as string[] };
}

export async function saveDiscoveryRun(prompt: string, criteria: DiscoveryCriteria) {
  const results = await findCandidates(criteria);
  const thread = await db.discoveryThread.findUniqueOrThrow({ where: { id: "discovery-main" }, include: { icpVersions: true } });
  const nextVersion = Math.max(0, ...thread.icpVersions.map((item) => item.version)) + 1;
  await db.$transaction([
    db.chatMessage.create({ data: { threadId: thread.id, role: "user", content: prompt } }),
    db.chatMessage.create({ data: { threadId: thread.id, role: "assistant", content: `I found ${results.length} candidates. ${criteriaSummary(criteria)}` } }),
    db.icpVersion.create({ data: { threadId: thread.id, version: nextVersion, prompt, criteriaJson: JSON.stringify(criteria) } }),
    db.researchRun.create({ data: { threadId: thread.id, criteriaJson: JSON.stringify(criteria), resultCount: results.length, status: "completed", isDemo: true } }),
    db.discoveryThread.update({ where: { id: thread.id }, data: { currentCriteriaJson: JSON.stringify(criteria) } }),
  ]);
  return results.map(serializeCandidate);
}
