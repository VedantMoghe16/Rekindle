import { ok } from "@/lib/api";
import { getLoop } from "@/lib/services/loop";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(await getLoop());
}
