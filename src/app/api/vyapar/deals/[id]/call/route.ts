import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { SarvamApiError, SarvamConfigError } from "@/lib/providers/sarvam-agent";
import { previewAgentCall, startAgentCall } from "@/lib/vyapar/server/conversation";

export const maxDuration = 30;
const Input = z.object({ provider: z.enum(["sarvam", "simulated"]).default("sarvam"), scenario: z.enum(["sample", "objection", "callback", "no_answer"]).optional() });

/** Preview the Sarvam "Vyapar SDR" call: the 11 inputs, opening line, masked number and any missing config. Never dials. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await previewAgentCall(id);
  return preview ? ok(preview) : fail("NOT_FOUND", "Deal not found.", 404);
}

/** { provider: "sarvam" } places one real call; { provider: "simulated", scenario } runs a full simulated call. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("INVALID_INPUT", "provider must be sarvam or simulated.");
  try {
    return ok(await startAgentCall(id, parsed.data));
  } catch (error) {
    if (error instanceof SarvamConfigError) return fail("NOT_CONFIGURED", error.message, 409);
    if (error instanceof SarvamApiError) { console.error("[vyapar/call] Sarvam:", error.message); return fail("SARVAM_ERROR", error.message, 502); }
    console.error("[vyapar/call]", error);
    return fail("CALL_FAILED", error instanceof Error ? error.message : "Couldn't start the call.", 500);
  }
}
