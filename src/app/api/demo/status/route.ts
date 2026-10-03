import { ok } from "@/lib/api";
import { db } from "@/lib/db";
import { defaultProvider, isProviderConfigured, modelFor } from "@/lib/providers/llm";
import { isCogneeConfigured } from "@/lib/providers/cognee";
import { isSarvamSttConfigured, isSarvamTtsConfigured } from "@/lib/providers/sarvam";
import { isN8nConfigured, isN8nVyaparConfigured } from "@/lib/providers/n8n";

export const dynamic = "force-dynamic";

export async function GET() {
  const [llmCache, sourceCache] = await Promise.all([db.llmCache.count(), db.sourceCache.count()]);
  return ok({
    offline: process.env.LLM_OFFLINE === "true",
    providers: {
      gemini: { live: isProviderConfigured("gemini"), detail: `${modelFor("gemini", "fast")}${defaultProvider() === "gemini" ? " · default" : ""}` },
      claude: { live: isProviderConfigured("anthropic"), detail: modelFor("anthropic", "smart") },
      sarvam: { live: isProviderConfigured("sarvam") || isSarvamSttConfigured() || isSarvamTtsConfigured(), detail: [isProviderConfigured("sarvam") && "chat", isSarvamTtsConfigured() && "voice", isSarvamSttConfigured() && "STT"].filter(Boolean).join(" + ") || "offline" },
      cognee: { live: isCogneeConfigured(), detail: process.env.COGNEE_DATASET || "rekindle-pipeline" },
      n8n: { live: isN8nConfigured() || isN8nVyaparConfigured(), detail: isN8nVyaparConfigured() ? "Vyapar webhook set" : isN8nConfigured() ? "campaign webhook set" : "simulated" },
    },
    cache: { llm: llmCache, sources: sourceCache },
  });
}
