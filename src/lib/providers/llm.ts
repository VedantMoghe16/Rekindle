import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { db } from "@/lib/db";

export const PROMPT_VERSION = "v1";

export class LlmOfflineMiss extends Error {
  constructor(public schemaName: string) {
    super(`No cached ${schemaName} response and the LLM is offline.`);
    this.name = "LlmOfflineMiss";
  }
}

export type Tier = "smart" | "fast";
export type LlmProvider = "anthropic" | "sarvam";
export type Provenance = "live" | "cached";

export function modelFor(provider: LlmProvider, tier: Tier): string {
  if (provider === "sarvam") return process.env.SARVAM_LLM_MODEL || "sarvam-105b";
  return tier === "smart" ? process.env.LLM_MODEL_SMART || "claude-opus-5-5" : process.env.LLM_MODEL_FAST || "claude-haiku-4-5";
}

export function isProviderConfigured(provider: LlmProvider): boolean {
  if (process.env.LLM_OFFLINE === "true") return false;
  return provider === "sarvam" ? Boolean(process.env.SARVAM_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isLlmAvailable(): boolean {
  return isProviderConfigured("anthropic");
}

export function cacheKey(parts: { provider: string; model: string; system: string; user: string; schemaName: string }): string {
  return createHash("sha256").update([PROMPT_VERSION, parts.provider, parts.model, parts.schemaName, parts.system, parts.user].join("\u0000")).digest("hex");
}

let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic({ timeout: 45_000, maxRetries: 2 });
  return client;
}

type StructuredArgs<S extends z.ZodTypeAny> = {
  tier: Tier;
  system: string;
  user: string;
  schema: S;
  schemaName: string;
  provider?: LlmProvider;
  maxTokens?: number;
};

async function readCache(key: string) {
  const row = await db.llmCache.findUnique({ where: { key } });
  return row ? JSON.parse(row.response) : null;
}

async function writeCache(key: string, provider: string, model: string, schemaName: string, value: unknown) {
  const response = JSON.stringify(value);
  await db.llmCache.upsert({ where: { key }, create: { key, provider, model, schemaName, response }, update: { response } });
}

async function callAnthropic<S extends z.ZodTypeAny>(args: StructuredArgs<S>, model: string, extra = ""): Promise<z.infer<S>> {
  const response = await anthropic().messages.parse({
    model,
    max_tokens: args.maxTokens ?? 8000,
    system: args.system,
    messages: [{ role: "user", content: args.user + extra }],
    output_config: { format: zodOutputFormat(args.schema) },
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (!response.parsed_output) throw new Error("The model returned output that does not match the schema.");
  return response.parsed_output as z.infer<S>;
}

async function callSarvam<S extends z.ZodTypeAny>(args: StructuredArgs<S>, model: string, extra = ""): Promise<z.infer<S>> {
  const base = process.env.SARVAM_BASE_URL || "https://api.sarvam.ai/v1";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: { "content-type": "application/json", "api-subscription-key": process.env.SARVAM_API_KEY ?? "", authorization: `Bearer ${process.env.SARVAM_API_KEY ?? ""}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: `${args.system}\n\nRespond with a single JSON object only, no prose and no code fences.` },
        { role: "user", content: args.user + extra },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Sarvam returned ${response.status}`);
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return args.schema.parse(JSON.parse(json));
}

/** Structured LLM call with a durable cache. Throws LlmOfflineMiss when offline and uncached; callers fall back to deterministic engines. */
export async function callStructured<S extends z.ZodTypeAny>(args: StructuredArgs<S>): Promise<{ data: z.infer<S>; provenance: Provenance; model: string }> {
  const provider = args.provider ?? "anthropic";
  const model = modelFor(provider, args.tier);
  const key = cacheKey({ provider, model, system: args.system, user: args.user, schemaName: args.schemaName });
  const cached = await readCache(key);
  if (cached) {
    const parsed = args.schema.safeParse(cached);
    if (parsed.success) return { data: parsed.data, provenance: "cached", model };
  }
  if (!isProviderConfigured(provider)) throw new LlmOfflineMiss(args.schemaName);
  const started = Date.now();
  const call = provider === "sarvam" ? callSarvam : callAnthropic;
  let data: z.infer<S>;
  try {
    data = await call(args, model);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw error;
    data = await call(args, model, `\n\nYour previous answer failed validation (${error instanceof Error ? error.message : "unknown error"}). Return valid output that matches the schema exactly.`);
  }
  await writeCache(key, provider, model, args.schemaName, data);
  console.info(`[llm] ${args.schemaName} ${provider}/${model} ${Date.now() - started}ms`);
  return { data, provenance: "live", model };
}
