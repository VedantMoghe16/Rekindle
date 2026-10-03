import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseWhatsApp } from "@/lib/parsers/whatsapp";

const Input = z.object({ accountId: z.string(), text: z.string().min(1).max(12_000), channel: z.enum(["whatsapp", "email", "call", "meeting", "note"]) });

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Choose an account and add a conversation." } }, { status: 400 });
  const { accountId, text, channel } = parsed.data;
  const normalized = channel === "whatsapp" ? parseWhatsApp(text).messages.map((m) => `[${m.timestamp}] ${m.speaker}: ${m.text}`).join("\n") : text.trim();
  if (channel === "whatsapp" && !normalized) return NextResponse.json({ ok: false, error: { code: "INVALID_WHATSAPP", message: "This does not look like a WhatsApp export. Try pasting it as text." } }, { status: 400 });
  const contentHash = createHash("sha256").update(text).digest("hex");
  const interaction = await db.interaction.findUnique({ where: { contentHash }, include: { deal: { include: { account: true, memory: true } } } });
  if (!interaction || interaction.deal.accountId !== accountId || !interaction.deal.memory) {
    return NextResponse.json({ ok: false, error: { code: "OFFLINE_CACHE_MISS", message: "This conversation is not in the offline demo cache. Configure an LLM provider or load a sample." } }, { status: 422 });
  }
  const memory = interaction.deal.memory;
  return NextResponse.json({ ok: true, data: { normalized, cached: true, alreadySaved: true, memory: {
    stallCategory: memory.stallCategory, summary: memory.summary, evidenceQuote: memory.evidenceQuote,
    evidenceSpeaker: memory.evidenceSpeaker, evidenceDate: memory.evidenceDate, confidence: memory.confidence,
  } } });
}
