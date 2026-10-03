import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { receiveReply } from "@/lib/vyapar/server/conversation";

export const maxDuration = 60;
const Input = z.object({ text: z.string().trim().min(1).max(1000) });

/** Inbound buyer message (WhatsApp webhook in production; typed or simulated in the demo). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Type the buyer's reply.");
  try {
    return ok(await receiveReply(id, parsed.data.text));
  } catch (error) {
    console.error("[vyapar/reply]", error);
    return fail("REPLY_FAILED", "Couldn't process that reply.", 500);
  }
}
