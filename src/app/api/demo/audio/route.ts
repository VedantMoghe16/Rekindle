import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Serves the bundled Hinglish voice-note sample so Capture can load it like a real upload. */
export async function GET() {
  const audio = await readFile(join(process.cwd(), "demo", "audio", "kredo_voice_note.wav"));
  return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/wav", "content-disposition": "inline; filename=kredo_voice_note.wav" } });
}
