import { fail, ok } from "@/lib/api";
import { getFleetRun } from "@/lib/vyapar/server/fleet";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getFleetRun(id);
  return run ? ok(run) : fail("NOT_FOUND", "Run not found.", 404);
}
