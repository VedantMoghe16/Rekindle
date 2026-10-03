import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { getSeller } from "@/lib/vyapar/server/context";
import { logEvent } from "@/lib/vyapar/server/opportunities";

/** For leads without a verified contact: add to the seller's visit route instead of messaging an unknown number. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await db.vyaparLead.findUnique({ where: { id } });
  if (!lead) return fail("NOT_FOUND", "Lead not found.", 404);
  const seller = await getSeller();
  await db.vyaparLead.update({ where: { id }, data: { status: "VISIT_PLANNED" } });
  await logEvent({ sellerId: seller.id, type: "VISIT_PLANNED", huntId: lead.huntId, leadId: id, merchantId: lead.merchantId, position: lead.position });
  return ok({ leadId: id });
}
