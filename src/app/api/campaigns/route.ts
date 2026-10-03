import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { StallCategory } from "@/lib/schemas";
import { generateCampaign, listCampaigns } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

const Body = z.object({ stallCategory: StallCategory, regenerateFrom: z.string().optional() });

export async function GET() {
  return ok(await listCampaigns());
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Send { stallCategory } with a valid stall category.");
  try {
    return ok(await generateCampaign(parsed.data), 201);
  } catch (error) {
    return fail("campaign_failed", error instanceof Error ? error.message : "Could not generate the campaign.", 422);
  }
}
