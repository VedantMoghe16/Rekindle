import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { launchCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

const Body = z.object({ platforms: z.array(z.enum(["linkedin", "x"])).optional() });

/** The UI shows an explicit approval step (exact copy per platform) before calling this, because n8n may post for real. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "platforms must be an array of \"linkedin\" and/or \"x\".");
  try {
    return ok(await launchCampaign(id, { platforms: parsed.data.platforms }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not launch the campaign.";
    return fail(message === "Campaign not found." ? "not_found" : "launch_failed", message, message === "Campaign not found." ? 404 : 500);
  }
}
