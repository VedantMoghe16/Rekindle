import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { DraftError, ensureNudgeRecommendation } from "@/lib/services/drafts";

const Input = z.object({ dealId: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "A deal is required.");
  try {
    const rec = await ensureNudgeRecommendation(parsed.data.dealId);
    return ok({ id: rec.id, headline: rec.headline });
  } catch (error) {
    if (error instanceof DraftError) return fail(error.code, error.message, error.status);
    console.error("[nudge]", error);
    return fail("NUDGE_FAILED", "We couldn't prepare a follow-up.", 500);
  }
}
