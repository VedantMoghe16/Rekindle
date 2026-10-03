import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { IntroError, requestIntroduction } from "@/lib/vyapar/server/needs";

const Input = z.object({ offerId: z.string().min(1) });

/** Buyer chooses a seller for this need. Only that seller may then contact them about it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Pick an offer.");
  try {
    return ok({ introductionId: await requestIntroduction(id, parsed.data.offerId) });
  } catch (error) {
    if (error instanceof IntroError) return fail(error.code, error.message, error.status);
    console.error("[vyapar/introductions]", error);
    return fail("INTRO_FAILED", "Couldn't send the request.", 500);
  }
}
