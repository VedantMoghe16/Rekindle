import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { verifyN8nSecret } from "@/lib/providers/n8n";
import { SignalType } from "@/lib/schemas";
import { ingestExternalSignal } from "@/lib/services/signals";

const Input = z.object({
  accountId: z.string().optional(), accountDomain: z.string().optional(),
  type: SignalType, title: z.string().min(1).max(300), detail: z.string().max(2000).optional(), sourceUrl: z.string().url().optional(), sourceName: z.string().max(60).optional(),
  occurredAt: z.coerce.date(), dedupeKey: z.string().min(3).max(300),
}).refine((value) => value.accountId || value.accountDomain, { message: "accountId or accountDomain is required" });

export async function POST(request: Request) {
  if (!verifyN8nSecret(request)) return fail("UNAUTHORIZED", "Missing or invalid x-rekindle-secret.", 401);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  try {
    const result = await ingestExternalSignal(parsed.data);
    if (!result) return fail("ACCOUNT_NOT_FOUND", "No account matches that id or domain.", 404);
    return ok(result);
  } catch (error) {
    console.error("[signals/ingest]", error);
    return fail("INGEST_FAILED", "The signal could not be stored.", 500);
  }
}
