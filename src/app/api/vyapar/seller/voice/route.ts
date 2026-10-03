import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { getSeller } from "@/lib/vyapar/server/context";
import { sarvamConfigFor } from "@/lib/providers/sarvam-agent";

const Input = z.object({ gender: z.enum(["male", "female"]) });

function voiceInfo(gender: "male" | "female") {
  let callVoiceMatches = true;
  try { callVoiceMatches = sarvamConfigFor(gender).voiceMatches; } catch { callVoiceMatches = gender === "female"; }
  return { callVoiceMatches };
}

/** The seller's gender sets the AI's voice (voice notes, calls) and its Hindi grammar when it speaks for them. */
export async function GET() {
  const seller = await getSeller();
  return ok({ gender: seller.ownerGender, persona: { name: seller.persona.agentName, speaker: seller.persona.speaker }, ...voiceInfo(seller.persona.gender) });
}

export async function PUT(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Choose male or female.");
  const seller = await getSeller();
  await db.vyaparSeller.update({ where: { id: seller.id }, data: { ownerGender: parsed.data.gender } });
  const next = await getSeller();
  return ok({ gender: next.ownerGender, persona: { name: next.persona.agentName, speaker: next.persona.speaker }, ...voiceInfo(next.persona.gender) });
}
