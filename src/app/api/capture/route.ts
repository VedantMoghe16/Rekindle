import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { LlmOfflineMiss } from "@/lib/providers/llm";
import { StallCategory } from "@/lib/schemas";
import { CaptureError, CHANNELS, commitCapture } from "@/lib/services/capture";

export const maxDuration = 60;

const Input = z.object({
  accountId: z.string().min(1),
  channel: z.enum(CHANNELS),
  text: z.string().min(1).max(60_000),
  edits: z.object({ stallCategory: StallCategory.optional(), summary: z.string().max(140).optional() }).optional(),
  mode: z.enum(["auto", "rules"]).optional(),
});

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Choose an account and add a conversation.");
  try {
    return ok(await commitCapture(parsed.data));
  } catch (error) {
    if (error instanceof CaptureError) return fail(error.code, error.message, error.status);
    if (error instanceof LlmOfflineMiss) return fail("OFFLINE_CACHE_MISS", "This conversation is not in the offline demo cache. Use the rules-based reading or configure an LLM provider.", 422);
    console.error("[capture]", error);
    return fail("CAPTURE_FAILED", "We couldn't save this conversation. Your text is kept; try again.", 500);
  }
}
