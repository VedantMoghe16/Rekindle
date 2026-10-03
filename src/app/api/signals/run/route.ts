import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { runSignalCheck } from "@/lib/services/signals";

export const maxDuration = 60;

const Input = z.object({ accountId: z.string().optional() });

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("INVALID_INPUT", "Invalid account.");
  try {
    return ok(await runSignalCheck(parsed.data));
  } catch (error) {
    console.error("[signals/run]", error);
    return fail("SIGNAL_CHECK_FAILED", "The signal check failed. Try again.", 500);
  }
}
