import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { LlmOfflineMiss } from "@/lib/providers/llm";
import { CaptureError, CHANNELS, previewCapture } from "@/lib/services/capture";

export const maxDuration = 60;

const Input = z.object({ accountId: z.string().min(1), text: z.string().min(1).max(60_000), channel: z.enum(CHANNELS), mode: z.enum(["auto", "rules"]).optional() });

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Choose an account and add a conversation.");
  try {
    return ok(await previewCapture(parsed.data));
  } catch (error) {
    if (error instanceof CaptureError) return fail(error.code, error.message, error.status);
    if (error instanceof LlmOfflineMiss) return fail("OFFLINE_CACHE_MISS", "This conversation is not in the offline demo cache. Configure an LLM provider, load a sample, or use the rules-based reading.", 422);
    console.error("[capture/preview]", error);
    return fail("EXTRACTION_FAILED", "We couldn't read this right now. Your text is kept; try again.", 500);
  }
}
