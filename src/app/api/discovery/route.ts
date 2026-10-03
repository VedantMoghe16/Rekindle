import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DiscoveryCriteria } from "@/lib/schemas";
import { findCandidates, serializeCandidate } from "@/lib/services/discovery";

export async function GET() {
  const thread = await db.discoveryThread.findUniqueOrThrow({ where: { id: "discovery-main" }, include: { messages: { orderBy: { createdAt: "asc" } }, researchRuns: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const criteria = DiscoveryCriteria.parse(JSON.parse(thread.currentCriteriaJson));
  const candidates = thread.researchRuns.length ? (await findCandidates(criteria)).map(serializeCandidate) : [];
  return NextResponse.json({ ok: true, data: { thread: { ...thread, criteria }, candidates } });
}
