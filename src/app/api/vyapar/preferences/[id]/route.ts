import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { liveNow } from "@/lib/vyapar/server/context";
import { logEvent } from "@/lib/vyapar/server/opportunities";

/** Undo a preference. Historical hunt snapshots are untouched; the live list re-ranks. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pref = await db.vyaparPreference.findUnique({ where: { id } });
  if (!pref) return fail("NOT_FOUND", "Preference not found.", 404);
  await db.vyaparPreference.update({ where: { id }, data: { active: false, undoneAt: liveNow() } });
  if (pref.merchantId && pref.kind !== "SAVE" && pref.kind !== "CAPACITY_ANSWER") await db.vyaparLead.updateMany({ where: { merchantId: pref.merchantId, status: "SKIPPED" }, data: { status: "SUGGESTED" } });
  if (pref.kind === "SAVE" && pref.merchantId) await db.vyaparLead.updateMany({ where: { merchantId: pref.merchantId, status: "SAVED" }, data: { status: "SUGGESTED" } });
  await logEvent({ sellerId: pref.sellerId, type: "PREF_UNDONE", huntId: pref.huntId, merchantId: pref.merchantId, meta: { kind: pref.kind } });
  return ok({ id });
}
