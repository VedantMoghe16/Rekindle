import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fail, ok } from "@/lib/api";
import { sarvamTranscribe, sarvamTranslate } from "@/lib/providers/sarvam";
import { languageName } from "@/lib/vyapar/languages";

export const maxDuration = 60;
const run = promisify(execFile);

/** Mic → text in the language spoken (Sarvam saaras, auto-detect), plus an English version to help plan the search. */
export async function POST(request: Request) {
  if (!process.env.SARVAM_API_KEY) return fail("LISTEN_UNAVAILABLE", "Voice input needs a Sarvam API key. Type your request instead.", 422);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size < 500) return fail("INVALID_INPUT", "Didn't catch any audio. Try again.");
  if (file.size > 10 * 1024 * 1024) return fail("FILE_TOO_LARGE", "Keep it under a minute.");
  const dir = await mkdtemp(join(tmpdir(), "vyapar-mic-"));
  try {
    // Browsers record webm/ogg/mp4; Sarvam gets a clean 16 kHz mono WAV.
    await writeFile(join(dir, "in"), Buffer.from(await file.arrayBuffer()));
    let audio: Blob = file;
    let name = file.name || "speech.webm";
    try {
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, "in"), "-ac", "1", "-ar", "16000", join(dir, "out.wav")], { timeout: 30_000 });
      audio = new Blob([new Uint8Array(await readFile(join(dir, "out.wav")))], { type: "audio/wav" });
      name = "speech.wav";
    } catch { /* send the original recording */ }
    const heard = await sarvamTranscribe(audio, name, "transcribe");
    const text = heard.text.trim();
    if (!text) return fail("NOTHING_HEARD", "Couldn't hear that. Try again a little closer to the mic.", 422);
    const lang = heard.languageCode;
    let english: string | null = null;
    if (lang && lang !== "en-IN") english = await sarvamTranslate(text, "en-IN", lang).catch(() => null);
    return ok({ text, languageCode: lang, language: languageName(lang), english });
  } catch (error) {
    console.error("[vyapar/listen]", error);
    return fail("LISTEN_FAILED", "Sarvam couldn't transcribe that. Try again or type it.", 502);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
