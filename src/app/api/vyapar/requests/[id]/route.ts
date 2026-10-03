import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { acceptIntroduction, declineIntroduction, IntroError } from "@/lib/vyapar/server/needs";

const Input = z.discriminatedUnion("action", [z.object({ action: z.literal("accept"), text: z.string().trim().min(10).max(1000) }), z.object({ action: z.literal("decline") })]);

/** Seller responds to a buyer's request: accept with an approved reply (opens the thread) or decline. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Accept with a message, or decline.");
  try {
    if (parsed.data.action === "decline") { await declineIntroduction(id); return ok({ declined: true }); }
    return ok({ dealId: await acceptIntroduction(id, parsed.data.text) });
  } catch (error) {
    if (error instanceof IntroError) return fail(error.code, error.message, error.status);
    console.error("[vyapar/requests]", error);
    return fail("REQUEST_FAILED", "Couldn't respond to the request.", 500);
  }
}
