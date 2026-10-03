import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { DraftError, updateRecommendation } from "@/lib/services/drafts";

const Input = z.object({ action: z.enum(["snooze", "dismiss", "sent"]), draftId: z.string().optional(), body: z.string().max(4000).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Unknown action.");
  try {
    const rec = await updateRecommendation(id, parsed.data);
    return ok({ id: rec.id, status: rec.status, snoozedUntil: rec.snoozedUntil });
  } catch (error) {
    if (error instanceof DraftError) return fail(error.code, error.message, error.status);
    console.error("[recommendation]", error);
    return fail("UPDATE_FAILED", "We couldn't update this recommendation.", 500);
  }
}
