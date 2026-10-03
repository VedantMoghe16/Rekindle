import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const samples: Record<string, { file: string; accountId: string; channel: string }> = {
  finvara: { file: "finvara_whatsapp.txt", accountId: "account-finvara", channel: "whatsapp" },
  kredo: { file: "kredo_call_transcript.txt", accountId: "account-kredo", channel: "call" },
};

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const sample = samples[name];
  if (!sample) return NextResponse.json({ ok: false, error: { code: "SAMPLE_NOT_FOUND", message: "Unknown sample." } }, { status: 404 });
  const text = await readFile(join(process.cwd(), "demo", "conversations", sample.file), "utf8");
  return NextResponse.json({ ok: true, data: { ...sample, text } });
}
