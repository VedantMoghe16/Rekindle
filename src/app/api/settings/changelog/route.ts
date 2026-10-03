import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { todayIso } from "@/lib/clock";
import { runMatcher, upsertComputedSignals } from "@/lib/services/matcher";

const Input = z.object({ title: z.string().trim().min(3).max(120), featureKey: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/) });

/** Shipping a feature re-checks every deal that stalled on that missing feature. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Add a title and a lowercase feature key like soc2_type2.");
  const seller = await db.sellerProfile.findFirst();
  if (!seller) return fail("NO_SELLER", "Seller profile is missing. Reset the demo.", 409);
  const changelog = JSON.parse(seller.changelogJson) as { date: string; title: string; featureKey: string }[];
  changelog.push({ date: todayIso(), title: parsed.data.title, featureKey: parsed.data.featureKey });
  await db.sellerProfile.update({ where: { id: seller.id }, data: { changelogJson: JSON.stringify(changelog) } });
  const added = await upsertComputedSignals();
  const laneChanges = await runMatcher();
  return ok({ signalsAdded: added, laneChanges });
}
