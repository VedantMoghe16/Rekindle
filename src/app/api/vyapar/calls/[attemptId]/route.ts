import { ok } from "@/lib/api";
import { pollAgentCall } from "@/lib/vyapar/server/conversation";

export const dynamic = "force-dynamic";

/** Call status for the chat banner. Falls back to Sarvam Analytics if the webhook hasn't arrived. */
export async function GET(_request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return ok(await pollAgentCall(attemptId));
}
