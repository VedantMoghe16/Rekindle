import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { DiscoveryCriteria } from "@/lib/schemas";
import { runDiscovery } from "@/lib/services/discovery";

export const maxDuration = 60;

const Input = z.object({ prompt: z.string().min(4).max(2000), criteria: DiscoveryCriteria });

export async function POST(request: Request) {
  const input = Input.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail("INVALID_PLAN", "The research plan is incomplete.");
  try {
    const result = await runDiscovery(input.data.prompt, input.data.criteria);
    return ok({ ...result, isDemo: result.mode === "demo" });
  } catch (error) {
    console.error("[discovery] run failed", error);
    return fail("RESEARCH_FAILED", "Research could not finish. Try again in a moment.", 500);
  }
}
