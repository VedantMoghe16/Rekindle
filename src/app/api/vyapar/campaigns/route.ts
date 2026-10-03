import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { Objection } from "@/lib/vyapar/taxonomy";
import { launchCampaign } from "@/lib/vyapar/server/insights";

const Input = z.object({ objection: Objection });

/** Approves and launches the campaign for an objection (n8n when configured, simulated otherwise). */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Pick an objection to answer.");
  try {
    return ok(await launchCampaign(parsed.data.objection));
  } catch (error) {
    console.error("[vyapar/campaigns]", error);
    return fail("LAUNCH_FAILED", "Couldn't launch the campaign.", 500);
  }
}
