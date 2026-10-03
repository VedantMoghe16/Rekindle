import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { ensureFollowupWorker, getFollowupQueue, planFollowups, runDueFollowups, saveFollowupSettings } from "@/lib/vyapar/server/followups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The follow-up queue (also starts the background worker). */
export async function GET() {
  ensureFollowupWorker();
  return ok(await getFollowupQueue());
}

const Input = z.union([z.object({ action: z.literal("scan") }), z.object({ action: z.literal("settings"), mode: z.enum(["review", "auto", "off"]) })]);

/** scan = look for silent deals now; settings = how much the agent may do on its own. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Unknown follow-up action.");
  try {
    if (parsed.data.action === "settings") await saveFollowupSettings(parsed.data.mode);
    const planned = await planFollowups();
    await runDueFollowups();
    return ok({ ...planned, queue: await getFollowupQueue() });
  } catch (error) {
    console.error("[vyapar/followups]", error);
    return fail("FOLLOWUP_FAILED", "Couldn't plan follow-ups right now.", 500);
  }
}
