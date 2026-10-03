import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { simulateEngagement } from "@/lib/services/engagement";

export const dynamic = "force-dynamic";

const Body = z.object({ campaignId: z.string().optional() });

/** Demo Controls: default plan Tripnest ×3, Zestcart ×3, Edunova ×1 → { events, laneChanges }. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Body must be {} or { campaignId }.");
  try {
    return ok(await simulateEngagement(parsed.data));
  } catch (error) {
    return fail("simulate_failed", error instanceof Error ? error.message : "Could not simulate engagement.", 500);
  }
}
