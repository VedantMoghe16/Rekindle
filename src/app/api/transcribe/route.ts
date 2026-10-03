import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { ok, fail } from "@/lib/api";
import { isSarvamSttConfigured, sarvamTranscribe } from "@/lib/providers/sarvam";

export const maxDuration = 60;

async function cachedTranscript(filename: string) {
  const stem = basename(filename, extname(filename)).replace(/[^a-z0-9_-]/gi, "");
  const path = join(process.cwd(), "demo", "transcripts", `${stem}.txt`);
  return existsSync(path) ? readFile(path, "utf8") : null;
}

/** Voice note → text. Sarvam saaras:v3 in codemix mode keeps Hinglish as spoken; falls back to a cached demo transcript. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("INVALID_INPUT", "Attach an audio file.");
  if (file.size > 25 * 1024 * 1024) return fail("FILE_TOO_LARGE", "Voice notes must be under 25 MB.");
  if (isSarvamSttConfigured()) {
    try {
      const result = await sarvamTranscribe(file, file.name, "codemix");
      if (result.text.trim()) return ok({ text: result.text, cached: false, provider: "sarvam", languageCode: result.languageCode });
    } catch (error) {
      console.error("[transcribe]", error);
      const cached = await cachedTranscript(file.name);
      if (cached) return ok({ text: cached, cached: true, provider: "cache", warning: "Sarvam was unavailable, so the cached transcript was used." });
      return fail("TRANSCRIBE_FAILED", "Sarvam could not transcribe this file. Paste the text instead.", 502);
    }
  }
  const cached = await cachedTranscript(file.name);
  if (cached) return ok({ text: cached, cached: true, provider: "cache" });
  return fail("TRANSCRIBE_UNAVAILABLE", "Voice transcription needs a Sarvam API key. Load the sample voice note or paste the text.", 422);
}
