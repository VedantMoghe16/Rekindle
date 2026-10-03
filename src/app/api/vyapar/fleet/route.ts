import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { startFleet } from "@/lib/vyapar/server/fleet";

const Input = z.object({ callMode: z.enum(["live", "simulated"]).default("live"), timing: z.enum(["quiet", "after_open", "now"]).default("quiet") });

/** Starts the AI sales team run (runs in the background; poll GET /api/vyapar/fleet/[id]). Only one run at a time. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("INVALID_INPUT", "callMode must be live or simulated.");
  try {
    return ok({ runId: await startFleet(parsed.data) });
  } catch (error) {
    console.error("[vyapar/fleet]", error);
    return fail("FLEET_FAILED", "Couldn't start the AI sales team.", 500);
  }
}
