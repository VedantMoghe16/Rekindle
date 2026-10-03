import { z } from "zod";
import { fail } from "@/lib/api";
import { isSarvamTtsConfigured, sarvamTts } from "@/lib/providers/sarvam";
import { getSeller } from "@/lib/vyapar/server/context";

export const maxDuration = 60;
const Input = z.object({ text: z.string().trim().min(2).max(1500) });
const cache = new Map<string, Buffer>();

/** Sarvam Bulbul voice note. 503 tells the client to use the device voice instead (labelled as such). */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Nothing to speak.");
  if (!isSarvamTtsConfigured()) return fail("TTS_OFFLINE", "Sarvam voice is not configured.", 503);
  try {
    // Voice notes speak as the seller, so they use a voice that matches the seller's gender.
    const { speaker } = (await getSeller()).persona;
    const key = `${speaker}:${parsed.data.text}`;
    const audio = cache.get(key) ?? await sarvamTts(parsed.data.text, speaker);
    cache.set(key, audio);
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=3600" } });
  } catch (error) {
    console.error("[vyapar/tts]", error);
    return fail("TTS_FAILED", "Sarvam voice failed.", 503);
  }
}
