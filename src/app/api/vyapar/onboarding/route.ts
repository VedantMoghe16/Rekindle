import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { getOnboarding, saveOnboarding } from "@/lib/vyapar/server/onboarding";

export const maxDuration = 60;
const Input = z.object({ answers: z.record(z.string(), z.string().max(400)) });

export async function GET() {
  return ok(await getOnboarding());
}

/** Saves onboarding answers; Gemini turns them into the brief the AI team works from (also written to Cognee). */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Answer at least what you sell.");
  try {
    return ok(await saveOnboarding(parsed.data.answers));
  } catch (error) {
    console.error("[vyapar/onboarding]", error);
    return fail("SAVE_FAILED", "Couldn't save your answers.", 500);
  }
}
