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
