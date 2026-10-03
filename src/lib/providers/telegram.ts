// Telegram as the demo stand-in for WhatsApp: "Send on WhatsApp" delivers to one demo chat (VYAPAR_TELEGRAM_CHAT_ID)
// through the team bot. Request shape follows the teammate's src/lib/vyapar/telegram.ts. The token is never logged.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.VYAPAR_TELEGRAM_CHAT_ID?.trim());
}
export function demoChatId() {
  return process.env.VYAPAR_TELEGRAM_CHAT_ID?.trim() ?? "";
}
const redact = (text: string) => text.replace(/bot\d+:[\w-]+/g, "bot<token>");

async function call<T>(method: string, body: Record<string, unknown> | FormData, timeoutMs = 20_000): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      ...(body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !json.ok) throw new Error(`Telegram ${method} failed (${res.status}): ${json.description ?? "no description"}`);
    return json.result as T;
  } catch (error) {
    throw new Error(redact(error instanceof Error ? error.message : String(error)));
  }
}

export function tgSendText(text: string, chatId = demoChatId()) {
  return call<{ message_id: number }>("sendMessage", { chat_id: chatId, text });
}

/** Sends a WAV as a Telegram voice note (converted to OGG/Opus with ffmpeg); falls back to an audio file. */
export async function tgSendVoice(wav: Buffer, caption: string, chatId = demoChatId()) {
  const dir = await mkdtemp(join(tmpdir(), "vyapar-voice-"));
  try {
    await writeFile(join(dir, "in.wav"), wav);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption.slice(0, 1000));
    try {
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, "in.wav"), "-c:a", "libopus", "-b:a", "32k", join(dir, "out.ogg")], { timeout: 30_000 });
      form.append("voice", new Blob([new Uint8Array(await readFile(join(dir, "out.ogg")))], { type: "audio/ogg" }), "pitch.ogg");
      return await call<{ message_id: number }>("sendVoice", form, 40_000);
    } catch {
      form.delete("voice");
      form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "pitch.wav");
      return await call<{ message_id: number }>("sendAudio", form, 40_000);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type TgUpdate = { update_id: number; message?: { message_id: number; chat: { id: number }; from?: { first_name?: string }; text?: string } };
export function tgGetUpdates(offset: number, timeoutSec = 25) {
  return call<TgUpdate[]>("getUpdates", { offset, timeout: timeoutSec, allowed_updates: ["message"] }, (timeoutSec + 10) * 1000);
}
