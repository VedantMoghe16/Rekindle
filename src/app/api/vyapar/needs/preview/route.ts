import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { previewNeed } from "@/lib/vyapar/server/needs";

export const maxDuration = 60;
const Input = z.object({ text: z.string().trim().min(4).max(400) });

/** Reads a buyer's request into fields for them to confirm. Never publishes or shares anything. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Describe what you need to buy.");
  try {
    return ok(await previewNeed(parsed.data.text));
  } catch (error) {
    console.error("[vyapar/needs/preview]", error);
    return fail("PREVIEW_FAILED", "Couldn't read that request. Fill the fields below instead.", 500);
  }
}
