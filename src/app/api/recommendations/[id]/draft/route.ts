import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { validateDraft } from "@/lib/engines/draft-rules";
import { DraftError, draftView, generateDraft } from "@/lib/services/drafts";

export const maxDuration = 60;

const Input = z.object({ channel: z.enum(["whatsapp", "email"]).default("whatsapp"), language: z.enum(["en", "hinglish"]).default("en") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("INVALID_INPUT", "Choose WhatsApp or Email.");
  try {
    return ok(await generateDraft(id, parsed.data.channel, parsed.data.language));
  } catch (error) {
    if (error instanceof DraftError) return fail(error.code, error.message, error.status);
    console.error("[draft]", error);
    return fail("DRAFT_FAILED", "We couldn't write a draft right now. Try again.", 500);
  }
}

/** Latest saved draft for this recommendation, if any. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await db.draft.findFirst({ where: { recommendationId: id }, orderBy: { createdAt: "desc" } });
  return ok(draft ? { ...draftView(draft), violations: validateDraft(draft.body, draft.channel === "email" ? "email" : "whatsapp") } : null);
}
