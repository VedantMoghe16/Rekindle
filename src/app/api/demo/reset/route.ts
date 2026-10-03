import { ok, fail } from "@/lib/api";
import { resetDemo } from "@/lib/services/demo";

export async function POST() {
  try {
    return ok(await resetDemo());
  } catch (error) {
    console.error(error);
    return fail("RESET_FAILED", "Could not reset the demo data.", 500);
  }
}
