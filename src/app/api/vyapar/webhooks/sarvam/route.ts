import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { SarvamOutboundWebhook } from "@/lib/providers/sarvam-agent";
import { processSarvamWebhook } from "@/lib/vyapar/server/conversation";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Sarvam post-call webhook (same path and secret scheme as the teammate's build). Idempotent on attempt_id. */
export async function POST(request: Request) {
  const expected = process.env.VYAPAR_WEBHOOK_SECRET?.trim();
  if (!expected) return NextResponse.json({ ok: false, error: { code: "NOT_CONFIGURED", message: "VYAPAR_WEBHOOK_SECRET is not set." } }, { status: 500 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: { code: "INVALID_JSON", message: "Body is not JSON." } }, { status: 400 }); }
  const metaSecret = (body as { webhook_config?: { metadata?: { secret?: unknown } } } | null)?.webhook_config?.metadata?.secret;
  const provided = new URL(request.url).searchParams.get("secret") ?? request.headers.get("x-vyapar-secret") ?? (typeof metaSecret === "string" ? metaSecret : "");
  if (!provided || !safeEqual(provided, expected)) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Bad webhook secret." } }, { status: 401 });
  const payload = SarvamOutboundWebhook.safeParse(body);
  if (!payload.success) return NextResponse.json({ ok: false, error: { code: "INVALID_PAYLOAD", message: payload.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, { status: 400 });
  try {
    // Unknown attempt_id answers 200 with ok:false so Sarvam does not retry forever.
    return NextResponse.json(await processSarvamWebhook(payload.data), { status: 200 });
  } catch (error) {
    console.error("[vyapar] Sarvam webhook failed", error);
    return NextResponse.json({ ok: false, error: { code: "PROCESSING_FAILED", message: (error as Error).message } }, { status: 500 });
  }
}
