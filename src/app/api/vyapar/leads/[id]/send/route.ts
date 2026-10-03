import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { sendPitch } from "@/lib/vyapar/server/pitches";

const Input = z.object({ text: z.string().trim().min(10).max(1000), withVoice: z.boolean().default(true) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "The message is empty or too long.");
  try {
    return ok({ dealId: await sendPitch(id, parsed.data.text, parsed.data.withVoice) });
  } catch (error) {
    console.error("[vyapar/send]", error);
    return fail("SEND_FAILED", "Couldn't send the pitch.", 500);
  }
}
