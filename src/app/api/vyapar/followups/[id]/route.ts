import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { approveFollowup, skipFollowup } from "@/lib/vyapar/server/followups";

const Input = z.object({ action: z.enum(["approve", "skip"]), text: z.string().max(1000).optional(), sendNow: z.boolean().optional() });

/** Human in the loop: approve (optionally edited, optionally right now) or skip a proposed follow-up. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "Approve or skip.");
  try {
    if (parsed.data.action === "skip") { await skipFollowup(id); return ok({ status: "SKIPPED" }); }
    const f = await approveFollowup(id, { text: parsed.data.text, sendNow: parsed.data.sendNow });
    return ok({ status: f.status });
  } catch (error) {
    return fail("FOLLOWUP_REJECTED", error instanceof Error ? error.message : "Couldn't approve", 422);
  }
}
