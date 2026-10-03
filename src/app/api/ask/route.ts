import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { ask } from "@/lib/services/knowledge";

export const maxDuration = 60;

const Input = z.object({ question: z.string().trim().min(3).max(500), accountId: z.string().optional() });

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Ask a question about your pipeline.");
  try {
    return ok(await ask(parsed.data.question, parsed.data.accountId));
  } catch (error) {
    console.error("[ask]", error);
    return fail("ASK_FAILED", "We couldn't answer that right now.", 500);
  }
}
