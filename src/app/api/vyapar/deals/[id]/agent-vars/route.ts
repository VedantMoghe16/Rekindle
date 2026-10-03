import { fail, ok } from "@/lib/api";
import { agentVariables } from "@/lib/vyapar/server/conversation";

/** Input variables for the Sarvam "Vyapar SDR" agent (docs/vyapar/sarvam-agent.md). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vars = await agentVariables(id);
  return vars ? ok(vars) : fail("NOT_FOUND", "Deal not found.", 404);
}
