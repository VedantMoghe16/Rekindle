import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { publishNeed } from "@/lib/vyapar/server/needs";

const Input = z.object({
  rawInput: z.string().trim().min(4).max(400),
  productKey: z.enum(["pastry_box", "paper_bag", "food_container"]),
  quantity: z.number().int().min(1).max(1_000_000),
  maxUnitPriceInr: z.number().positive().max(100_000).nullable(),
  neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sampleFirst: z.boolean(),
  backupSupplier: z.boolean(),
});

/** Publishes a buyer-confirmed need. Product, quantity and date are required; budget may stay unknown. */
export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Confirm the product, quantity and date before publishing.");
  try {
    return ok({ needId: await publishNeed(parsed.data) });
  } catch (error) {
    console.error("[vyapar/needs]", error);
    return fail("PUBLISH_FAILED", "Couldn't publish the need.", 500);
  }
}
