import { fail, ok } from "@/lib/api";
import { getPitch } from "@/lib/vyapar/server/pitches";

export const maxDuration = 60;

/** Regenerates the pitch draft for a lead. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await getPitch(id, true);
    return result ? ok(result.pitch) : fail("NOT_FOUND", "Lead not found.", 404);
  } catch (error) {
    console.error("[vyapar/pitch]", error);
    return fail("PITCH_FAILED", "Couldn't rewrite the pitch right now.", 500);
  }
}
