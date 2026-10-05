import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/providers/sarvam-agent";

/** The phone every demo AI call rings: the visitor's own number (asked on first visit, saved as the priority-1 demo contact), else env. */
export async function demoPhone(): Promise<string | null> {
  const p1 = await db.demoContact.findUnique({ where: { priority: 1 } });
  const raw = (p1?.phone || process.env.DEMO_CALL_PHONE || process.env.DEMO_KARAN_PHONE)?.trim();
  return raw ? normalizePhone(raw) : null;
}

/** Saves the visitor's phone as the priority-1 demo contact and moves deals that rang the previous number over to it. */
export async function setDemoPhone(phone: string) {
  const next = normalizePhone(phone);
  const p1 = await db.demoContact.findUnique({ where: { priority: 1 } });
  await db.demoContact.upsert({ where: { priority: 1 }, create: { priority: 1, label: "Priority 1", phone: next, telegramChatId: process.env.VYAPAR_TELEGRAM_CHAT_ID || null }, update: { phone: next } });
  const prev = p1?.phone?.trim();
  if (prev && normalizePhone(prev) !== next) await db.vyaparDeal.updateMany({ where: { demoPhone: { in: [prev, normalizePhone(prev)] } }, data: { demoPhone: next } });
  return next;
}
