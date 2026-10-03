import { ok } from "@/lib/api";
import { db } from "@/lib/db";
import { isProviderConfigured, modelFor } from "@/lib/providers/llm";
import { isCogneeConfigured } from "@/lib/providers/cognee";
import { isSarvamSttConfigured } from "@/lib/providers/sarvam";
import { isN8nConfigured } from "@/lib/providers/n8n";

export const dynamic = "force-dynamic";

export async function GET() {
  const [llmCache, sourceCache] = await Promise.all([db.llmCache.count(), db.sourceCache.count()]);
  return ok({
    offline: process.env.LLM_OFFLINE === "true",
    providers: {
      claude: { live: isProviderConfigured("anthropic"), detail: modelFor("anthropic", "smart") },
      sarvam: { live: isProviderConfigured("sarvam") || isSarvamSttConfigured(), detail: isSarvamSttConfigured() ? "STT + chat" : "chat" },
      cognee: { live: isCogneeConfigured(), detail: process.env.COGNEE_DATASET || "rekindle-pipeline" },
      n8n: { live: isN8nConfigured(), detail: isN8nConfigured() ? "webhook set" : "simulated" },
    },
    cache: { llm: llmCache, sources: sourceCache },
  });
}
