import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { compileDiscoveryPrompt, criteriaSummary, DEFAULT_CRITERIA } from "@/lib/engines/discovery";
import { DiscoveryCriteria } from "@/lib/schemas";

const Input = z.object({ prompt: z.string().min(4).max(2000) });

export async function POST(request: Request) {
  const input = Input.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ ok: false, error: { code: "INVALID_PROMPT", message: "Describe the product and target customer." } }, { status: 400 });
  const thread = await db.discoveryThread.findUnique({ where: { id: "discovery-main" } });
  const current = thread ? DiscoveryCriteria.parse(JSON.parse(thread.currentCriteriaJson)) : DEFAULT_CRITERIA;
  const criteria = compileDiscoveryPrompt(input.data.prompt, current);
  return NextResponse.json({ ok: true, data: {
    criteria, summary: criteriaSummary(criteria),
    productProfile: { name: "CloudKavach", product: "Cloud security and compliance automation", capabilities: ["SOC 2 readiness", "ISO 27001 evidence collection", "Cloud security posture monitoring"], proofPoints: ["Median 14-day onboarding", "One-click AWS, GCP and Azure connectors"] },
    sources: ["Company websites", "Public careers pages", "Funding and company news"],
  } });
}
