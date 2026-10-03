import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { preferenceFromSkip, SKIP_REASONS } from "@/lib/vyapar/preferences";
import { getSeller } from "@/lib/vyapar/server/context";
import { logEvent } from "@/lib/vyapar/server/opportunities";

const Input = z.object({ action: z.enum(["save", "skip"]), reason: z.enum(SKIP_REASONS.map((r) => r.code) as [string, ...string[]]).optional() });

/** Save or skip a lead. A skip reason becomes an explicit, undoable seller preference that re-ranks the list. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === "skip" && !parsed.data.reason)) return fail("INVALID_INPUT", "Choose save, or skip with a reason.");
  const lead = await db.vyaparLead.findUnique({ where: { id }, include: { merchant: true } });
  if (!lead) return fail("NOT_FOUND", "Lead not found.", 404);
  const seller = await getSeller();
  if (parsed.data.action === "save") {
    const pref = await db.vyaparPreference.create({ data: { sellerId: seller.id, kind: "SAVE", merchantId: lead.merchantId, label: `saved ${lead.merchant.name}`, huntId: lead.huntId } });
    await db.vyaparLead.update({ where: { id }, data: { status: "SAVED" } });
    await logEvent({ sellerId: seller.id, type: "SAVED", huntId: lead.huntId, leadId: id, merchantId: lead.merchantId, position: lead.position });
    return ok({ preferenceId: pref.id, label: pref.label });
  }
  const draft = preferenceFromSkip(parsed.data.reason as (typeof SKIP_REASONS)[number]["code"], { merchantId: lead.merchantId, merchantName: lead.merchant.name, category: lead.merchant.category, distanceKm: lead.distanceKm, band: lead.merchant.source === "osm" ? null : lead.merchant.qrVolumeBand });
  const pref = await db.vyaparPreference.create({ data: { sellerId: seller.id, ...draft, huntId: lead.huntId } });
  await db.vyaparLead.update({ where: { id }, data: { status: "SKIPPED" } });
  await logEvent({ sellerId: seller.id, type: "SKIPPED", huntId: lead.huntId, leadId: id, merchantId: lead.merchantId, position: lead.position, meta: { reason: parsed.data.reason, preference: draft.kind } });
  return ok({ preferenceId: pref.id, label: pref.label });
}
