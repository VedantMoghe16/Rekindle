import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { saveDemoContacts } from "@/lib/vyapar/server/fleet";

const Phone = z.string().trim().regex(/^\+?[\d\s-]{10,16}$/, "Phone looks wrong").nullable();
const Input = z.object({ contacts: z.array(z.object({ priority: z.number().int().min(1).max(3), phone: Phone, telegramChatId: z.string().trim().regex(/^-?\d{5,15}$/, "Telegram chat id is a number").nullable() })).min(1).max(3) });

/** Demo routing: which phone and Telegram chat stand in for the priority-1/2/3 businesses. */
export async function PUT(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Check the numbers.");
  return ok(await saveDemoContacts(parsed.data.contacts.map((c) => ({ ...c, phone: c.phone ? c.phone.replace(/[\s-]/g, "") : null }))));
}
