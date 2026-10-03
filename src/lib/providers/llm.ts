import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db } from "@/lib/db";

export const PROMPT_VERSION = "v1";

export class LlmOfflineMiss extends Error {
  constructor(public schemaName: string) {
    super(`No cached ${schemaName} response and the LLM is offline.`);
    this.name = "LlmOfflineMiss";
  }
}

export type Tier = "smart" | "fast";
export type LlmProvider = "anthropic" | "sarvam" | "gemini";
export type Provenance = "live" | "cached";

export function modelFor(provider: LlmProvider, tier: Tier): string {
  if (provider === "sarvam") return process.env.SARVAM_LLM_MODEL || "sarvam-105b";
  if (provider === "gemini") return tier === "smart" ? process.env.GEMINI_MODEL_SMART || process.env.GEMINI_MODEL || "gemini-2.5-flash" : process.env.GEMINI_MODEL || "gemini-2.5-flash";
  return tier === "smart" ? process.env.LLM_MODEL_SMART || "claude-opus-5-5" : process.env.LLM_MODEL_FAST || "claude-haiku-4-5";
}

export function isProviderConfigured(provider: LlmProvider): boolean {
  if (process.env.LLM_OFFLINE === "true") return false;
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  return provider === "sarvam" ? Boolean(process.env.SARVAM_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);
}

/** The general-purpose model: LLM_PROVIDER if set, else Gemini when its key exists, else Claude. */
export function defaultProvider(): LlmProvider {
  const chosen = process.env.LLM_PROVIDER;
  if (chosen === "gemini" || chosen === "anthropic" || chosen === "sarvam") return chosen;
  return process.env.GEMINI_API_KEY ? "gemini" : "anthropic";
}

export function isLlmAvailable(): boolean {
  return isProviderConfigured(defaultProvider());
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

/** Gemini generateContent in JSON mode; the zod schema is sent as a JSON schema and the reply is zod-validated. */
async function callGemini<S extends z.ZodTypeAny>(args: StructuredArgs<S>, model: string, extra = ""): Promise<z.infer<S>> {
  const base = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const schema = z.toJSONSchema(args.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  const response = await fetch(`${base}/models/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: "user", parts: [{ text: args.user + extra }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: args.maxTokens ?? 8000, responseMimeType: "application/json", responseJsonSchema: schema,
        // Fast-tier calls (drafts, classification, plans) skip "thinking": 2.5 Flash then answers in ~2 s instead of 10–25 s.
        ...(args.tier !== "smart" && /2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Gemini returned no content (${body.candidates?.[0]?.finishReason ?? "unknown"})`);
  return args.schema.parse(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
}

/** Structured LLM call with a durable cache. Throws LlmOfflineMiss when offline and uncached; callers fall back to deterministic engines. */
export async function callStructured<S extends z.ZodTypeAny>(args: StructuredArgs<S>): Promise<{ data: z.infer<S>; provenance: Provenance; model: string; provider: LlmProvider }> {
  const provider = args.provider ?? defaultProvider();
  const model = modelFor(provider, args.tier);
  const key = cacheKey({ provider, model, system: args.system, user: args.user, schemaName: args.schemaName });
  const cached = await readCache(key);
  if (cached) {
    const parsed = args.schema.safeParse(cached);
    if (parsed.success) return { data: parsed.data, provenance: "cached", model, provider };
  }
  if (!isProviderConfigured(provider)) throw new LlmOfflineMiss(args.schemaName);
  const started = Date.now();
  const call = provider === "sarvam" ? callSarvam : provider === "gemini" ? callGemini : callAnthropic;
  let data: z.infer<S>;
  try {
    data = await call(args, model);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw error;
    data = await call(args, model, `\n\nYour previous answer failed validation (${error instanceof Error ? error.message : "unknown error"}). Return valid output that matches the schema exactly.`);
  }
  await writeCache(key, provider, model, args.schemaName, data);
  console.info(`[llm] ${args.schemaName} ${provider}/${model} ${Date.now() - started}ms`);
  return { data, provenance: "live", model, provider };
}
