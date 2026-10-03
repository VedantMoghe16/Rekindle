import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fail, ok } from "@/lib/api";

const samples: Record<string, { file: string; accountId: string; channel: string; label: string }> = {
  finvara: { file: "finvara_whatsapp.txt", accountId: "account-finvara", channel: "whatsapp", label: "Finvara WhatsApp" },
  kredo: { file: "kredo_call_transcript.txt", accountId: "account-kredo", channel: "call", label: "Kredo call" },
  mediloop: { file: "mediloop_email.txt", accountId: "account-mediloop", channel: "email", label: "MediLoop email" },
  ledgerline: { file: "ledgerline_email.txt", accountId: "account-ledgerline", channel: "email", label: "Ledgerline email" },
  tripnest: { file: "tripnest_whatsapp.txt", accountId: "account-tripnest", channel: "whatsapp", label: "Tripnest WhatsApp" },
};

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!name) return ok(Object.entries(samples).map(([key, sample]) => ({ name: key, label: sample.label, accountId: sample.accountId, channel: sample.channel })));
  const sample = samples[name];
  if (!sample) return fail("SAMPLE_NOT_FOUND", "Unknown sample.", 404);
  const text = await readFile(join(process.cwd(), "demo", "conversations", sample.file), "utf8");
  return ok({ ...sample, name, text });
}
