import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { TOOLS, type ToolName } from "@/lib/vyapar/server/agent-tools";
import { getSeller } from "@/lib/vyapar/server/context";
import { speakAs } from "@/lib/vyapar/persona";

export const dynamic = "force-dynamic";

function authorised(request: Request) {
  const expected = process.env.VYAPAR_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const url = new URL(request.url);
  const provided = url.searchParams.get("secret") ?? request.headers.get("x-vyapar-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-api-key") ?? "";
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sarvam "Vyapar SDR" agent backend.
 *   POST /api/vyapar/agent/context            on_start hook (caller phone → context variables)
 *   POST /api/vyapar/agent/get_counter        { objections, transcript }
 *   POST /api/vyapar/agent/quote_price        { qty, sku? }
 *   POST /api/vyapar/agent/log_objection      { type, quote }
 *   POST /api/vyapar/agent/schedule_followup  { time, reason }
 *   POST /api/vyapar/agent/book_sample        { time, place }
 *   POST /api/vyapar/agent/send_on_telegram   { what: price_list | offer | sample }
 * All accept phone / user_identifier, deal_id and transcript. Auth: ?secret=, x-vyapar-secret, or Bearer.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!authorised(request)) return NextResponse.json({ ok: false, say: "", error: "unauthorised" }, { status: 401 });
  const handler = TOOLS[tool as ToolName];
  if (!handler) return NextResponse.json({ ok: false, say: "", error: `unknown tool ${tool}` }, { status: 404 });
  const started = Date.now();
  const body = await request.json().catch(() => ({}));
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  try {
    const [result, seller] = await Promise.all([handler({ ...query, ...(body && typeof body === "object" ? body : {}) }), getSeller()]);
    console.info(`[vyapar/agent] ${tool} ${Date.now() - started}ms`);
    // What the agent says agrees with its voice, which matches the seller ("samajh gaya/gayi").
    const say = (result as { say?: unknown }).say;
    return NextResponse.json(typeof say === "string" ? { ...result, say: speakAs(say, seller.persona.gender) } : result);
  } catch (error) {
    console.error(`[vyapar/agent] ${tool} failed`, error);
    const seller = await getSeller().catch(() => null);
    return NextResponse.json({ ok: false, say: speakAs(`Ek second ji, main ${seller?.ownerFirstName ?? "malik"} ji se confirm karke batati hoon.`, seller?.persona.gender ?? "female"), error: "failed" }, { status: 200 });
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ tool: string }> }) {
  return POST(request, ctx);
}
