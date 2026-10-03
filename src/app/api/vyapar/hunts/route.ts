import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { createHunt } from "@/lib/vyapar/server/hunts";

export const maxDuration = 60;
const Input = z.object({ prompt: z.string().trim().min(2).max(600), english: z.string().trim().max(600).nullish() });

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Tell Vyapar AI what you sell and who to find.");
  try {
    return ok({ huntId: await createHunt(parsed.data.prompt, parsed.data.english) });
  } catch (error) {
    console.error("[vyapar/hunts]", error);
    return fail("HUNT_FAILED", "Couldn't search nearby merchants right now.", 500);
  }
}
