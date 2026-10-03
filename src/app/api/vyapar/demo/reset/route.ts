import { fail, ok } from "@/lib/api";
import { seedVyapar } from "../../../../../../prisma/vyapar-seed";

/** Restores the Vyapar AI demo (merchants, seller, seeded deals). Leaves LLM caches intact. */
export async function POST() {
  try {
    return ok(await seedVyapar());
  } catch (error) {
    console.error("[vyapar/demo/reset]", error);
    return fail("RESET_FAILED", "Couldn't reset the demo.", 500);
  }
}
