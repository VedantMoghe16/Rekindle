import { ok } from "@/lib/api";
import { cancelFleet } from "@/lib/vyapar/server/fleet";

/** Stop button. Nothing new is sent or dialled; a call already ringing finishes and is recorded. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return ok({ status: await cancelFleet(id) });
}
