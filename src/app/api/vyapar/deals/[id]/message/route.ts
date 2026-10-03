import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { PLAYS } from "@/lib/vyapar/counter";
import { sendMessage } from "@/lib/vyapar/server/conversation";

const Input = z.object({ text: z.string().trim().min(1).max(1000), play: z.string().optional(), autopilot: z.boolean().optional() });

/** Our outbound message (approved suggestion or free text). Also toggles autopilot for the deal. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Message can't be empty.");
  try {
    const play = parsed.data.play ? Object.values(PLAYS).flat().find((p) => p.id === parsed.data.play) ?? null : null;
    return ok({ events: await sendMessage(id, parsed.data.text, { play, author: play ? "Rahul · approved AI reply" : "Rahul", provider: play ? "template" : "human" }) });
  } catch (error) {
    console.error("[vyapar/message]", error);
    return fail("MESSAGE_FAILED", "Couldn't send the message.", 500);
  }
}

const Patch = z.object({ autopilot: z.boolean() });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "autopilot must be true or false.");
  await db.vyaparDeal.update({ where: { id }, data: { autopilot: parsed.data.autopilot } });
  return ok({ autopilot: parsed.data.autopilot });
}
