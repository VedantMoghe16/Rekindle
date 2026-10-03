import { fail, ok } from "@/lib/api";
import { getObjectionInsights } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getObjectionInsights());
  } catch (error) {
    return fail("insights_failed", error instanceof Error ? error.message : "Could not load objections.", 500);
  }
}
