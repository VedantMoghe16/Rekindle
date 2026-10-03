import { fail, ok } from "@/lib/api";
import { ingestAll } from "@/lib/services/knowledge";

export const maxDuration = 60;

export async function POST() {
  try {
    return ok(await ingestAll());
  } catch (error) {
    console.error("[knowledge/ingest]", error);
    return fail("INGEST_FAILED", error instanceof Error ? error.message : "Cognee ingest failed.", 502);
  }
}
