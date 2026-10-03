import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { DEFAULT_CRITERIA } from "@/lib/engines/discovery";
import { DiscoveryCriteria } from "@/lib/schemas";
import { compileIcp } from "@/lib/services/discovery";

const Input = z.object({ prompt: z.string().min(4).max(2000), criteria: DiscoveryCriteria.optional() });

export async function POST(request: Request) {
  const input = Input.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail("INVALID_PROMPT", "Describe the product and target customer.");
  const thread = await db.discoveryThread.findUnique({ where: { id: "discovery-main" } });
  const current = input.data.criteria ?? (thread ? DiscoveryCriteria.parse(JSON.parse(thread.currentCriteriaJson)) : DEFAULT_CRITERIA);
  const compiled = await compileIcp(input.data.prompt, current);
  const registry = await db.company.count();
  const sources = ["Greenhouse job boards", "Lever job boards", "Google News", `Curated company registry (${registry} companies)`];
  return ok({ ...compiled, sources });
}
