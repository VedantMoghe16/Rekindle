import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { getSeller } from "@/lib/vyapar/server/context";
import { logEvent } from "@/lib/vyapar/server/opportunities";

const Input = z.object({ canSupplyBulk: z.boolean(), huntId: z.string().optional() });

/** The one clarification that changes the shortlist: can the seller supply 1,000+ pcs a month to one buyer? */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Answer yes or no.");
  const seller = await getSeller();
  await db.vyaparPreference.updateMany({ where: { sellerId: seller.id, kind: "CAPACITY_ANSWER", active: true }, data: { active: false } });
  const label = parsed.data.canSupplyBulk ? "can supply 1,000+ pcs a month to one buyer" : "can't supply 1,000+ pcs a month to one buyer";
  const pref = await db.vyaparPreference.create({ data: { sellerId: seller.id, kind: "CAPACITY_ANSWER", value: parsed.data.canSupplyBulk ? "yes" : "no", label, huntId: parsed.data.huntId ?? null } });
  await logEvent({ sellerId: seller.id, type: "CLARIFIED", huntId: parsed.data.huntId, meta: { canSupplyBulk: parsed.data.canSupplyBulk } });
  return ok({ preferenceId: pref.id, label });
}
