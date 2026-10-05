import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { normalizePhone } from "@/lib/providers/sarvam-agent";
import { setDemoPhone } from "@/lib/vyapar/server/demo-phone";

const Input = z.object({ phone: z.string().trim().transform(normalizePhone).refine((p) => /^\+[1-9]\d{9,14}$/.test(p), "Enter a 10-digit mobile number, or include the country code") });

/** The visitor's own phone: demo AI calls ring it, since the demo shops are fictional. */
export async function PUT(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Check the number.");
  return ok({ phone: await setDemoPhone(parsed.data.phone) });
}
