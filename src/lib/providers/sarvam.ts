/** Sarvam speech-to-text (saaras:v3, codemix for Hinglish). Chat goes through providers/llm.ts. */
export function isSarvamSttConfigured() {
  return process.env.TRANSCRIBE_PROVIDER === "sarvam" && Boolean(process.env.SARVAM_API_KEY);
}

export async function sarvamTranscribe(file: Blob, filename: string, mode: "codemix" | "transcribe" | "translate" = "codemix"): Promise<{ text: string; languageCode: string | null }> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", process.env.SARVAM_STT_MODEL || "saaras:v3");
  form.append("mode", mode);
  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY ?? "" },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Sarvam speech-to-text returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json() as { transcript?: string; language_code?: string | null };
  return { text: body.transcript ?? "", languageCode: body.language_code ?? null };
}

export function isSarvamTtsConfigured() {
  return Boolean(process.env.SARVAM_API_KEY) && process.env.LLM_OFFLINE !== "true";
}

/** Sarvam Bulbul text-to-speech. Returns WAV bytes for a Hinglish/Hindi voice note. */
export async function sarvamTts(text: string, speaker = process.env.SARVAM_TTS_SPEAKER || "priya"): Promise<Buffer> {
  const response = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "content-type": "application/json", "api-subscription-key": process.env.SARVAM_API_KEY ?? "" },
    body: JSON.stringify({ text: text.slice(0, 1500), target_language_code: "hi-IN", speaker, model: process.env.SARVAM_TTS_MODEL || "bulbul:v3" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Sarvam text-to-speech returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json() as { audios?: string[] };
  const audio = body.audios?.[0];
  if (!audio) throw new Error("Sarvam text-to-speech returned no audio");
  return Buffer.from(audio, "base64");
}

/** Sarvam Translate (sarvam-translate:v1, 22 Indian languages). One string per request; callers cache. */
export async function sarvamTranslate(text: string, target: string, source = "en-IN"): Promise<string> {
  const response = await fetch("https://api.sarvam.ai/translate", {
    method: "POST",
    headers: { "content-type": "application/json", "api-subscription-key": process.env.SARVAM_API_KEY ?? "" },
    body: JSON.stringify({ input: text.slice(0, 2000), source_language_code: source, target_language_code: target, model: process.env.SARVAM_TRANSLATE_MODEL || "sarvam-translate:v1" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Sarvam translate returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json() as { translated_text?: string };
  return body.translated_text ?? text;
}
