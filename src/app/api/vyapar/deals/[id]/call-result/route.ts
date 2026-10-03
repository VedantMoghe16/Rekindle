import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { CallResult, receiveCallResult } from "@/lib/vyapar/server/conversation";

const Input = z.object({ outcome: z.enum(CallResult.outcomes), objection_type: z.enum(CallResult.objections).default("none"), objection_quote: z.string().max(400).default(""), callback_time: z.string().max(120).default("") });

/** Output variables from the Sarvam "Vyapar SDR" agent (or the in-app simulator) for this deal. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Expected { outcome, objection_type, objection_quote, callback_time }.");
  try {
    return ok(await receiveCallResult(id, parsed.data));
  } catch (error) {
    console.error("[vyapar/call-result]", error);
    return fail("CALL_RESULT_FAILED", "Couldn't record the call result.", 500);
  }
}
