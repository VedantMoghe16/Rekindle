import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { askMemory } from "@/lib/vyapar/server/insights";

export const maxDuration = 60;
const Input = z.object({ question: z.string().trim().min(3).max(300), merchantId: z.string().optional() });

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Ask a question about your buyers.");
  try {
    return ok(await askMemory(parsed.data.question, parsed.data.merchantId));
  } catch (error) {
    console.error("[vyapar/ask]", error);
    return fail("ASK_FAILED", "Couldn't search memory right now.", 500);
  }
}
