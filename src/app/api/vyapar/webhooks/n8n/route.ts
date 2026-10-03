import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { verifyN8nSecret } from "@/lib/providers/n8n";

const Input = z.object({ event: z.literal("action.completed"), ref: z.string(), status: z.enum(["scheduled", "dispatched", "delivered", "paid", "failed"]), note: z.string().max(200).optional() });

/** n8n calls back when the warehouse dispatches, the calendar confirms or a payment lands. */
export async function POST(request: Request) {
  if (!verifyN8nSecret(request)) return fail("UNAUTHORIZED", "Bad or missing x-rekindle-secret.", 401);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Expected { event: 'action.completed', ref, status }.");
  const action = await db.vyaparAction.findFirst({ where: { ref: parsed.data.ref } });
  if (!action) return fail("NOT_FOUND", "Unknown action ref.", 404);
  await db.vyaparAction.update({ where: { id: action.id }, data: { status: parsed.data.status, summary: parsed.data.note ? `${action.summary} · ${parsed.data.note}` : action.summary } });
  if (action.type === "SAMPLE_DISPATCH" && parsed.data.status === "delivered") await db.vyaparDeal.update({ where: { id: action.dealId }, data: { stage: "SAMPLE_SENT" } });
  if (action.type === "PAYMENT_LINK" && parsed.data.status === "paid") await db.vyaparDeal.update({ where: { id: action.dealId }, data: { stage: "ORDER_WON" } });
  return ok({ updated: action.id });
}
