import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { SarvamApiError, SarvamConfigError } from "@/lib/providers/sarvam-agent";
import { ensureDealForLead, startAgentCall } from "@/lib/vyapar/server/conversation";

export const maxDuration = 30;
const Input = z.object({ provider: z.enum(["sarvam", "simulated"]).default("sarvam"), scenario: z.enum(["sample", "objection", "callback", "no_answer"]).optional() });

/** Pitch → AI call: opens (or reuses) the deal for this lead, then starts the call. Returns the deal to open. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("INVALID_INPUT", "provider must be sarvam or simulated.");
  try {
    const dealId = await ensureDealForLead(id);
    return ok({ dealId, ...(await startAgentCall(dealId, parsed.data)) });
  } catch (error) {
    if (error instanceof SarvamConfigError) return fail("NOT_CONFIGURED", error.message, 409);
    if (error instanceof SarvamApiError) { console.error("[vyapar/call] Sarvam:", error.message); return fail("SARVAM_ERROR", error.message, 502); }
    console.error("[vyapar/lead-call]", error);
    return fail("CALL_FAILED", error instanceof Error ? error.message : "Couldn't start the call.", 500);
  }
}
