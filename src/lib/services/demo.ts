import { db } from "@/lib/db";
import { seed } from "../../../prisma/seed";
import { seedVyapar } from "../../../prisma/vyapar-seed";
import { runMatcher, upsertComputedSignals } from "@/lib/services/matcher";

/** Restores the seeded demo state. Never touches LlmCache or SourceCache. */
export async function resetDemo() {
  await seed();
  await seedVyapar();
  await upsertComputedSignals();
  await runMatcher();
  await db.laneChange.updateMany({ data: { seen: true } });
  const [revive, warm, watch] = await Promise.all(["REVIVE", "WARM", "WATCH"].map((lane) => db.deal.count({ where: { lane } })));
  return { revive, warm, watch };
}
