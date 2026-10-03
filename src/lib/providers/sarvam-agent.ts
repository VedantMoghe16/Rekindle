// Sarvam Voice Agents (Samvaad) client for the "Vyapar SDR" agent: Instant Outbound create + Analytics polling fallback.
// Ported from the teammate's vyapar-integration branch (src/lib/vyapar/sarvam.ts, outcome.ts, types.ts) so both
// builds speak the same agent contract (docs/vyapar/sarvam-agent.md). Keep them in sync.
import { z } from "zod";

export const CallOutcome = z.enum(["interested", "sample_requested", "objection", "not_interested", "callback"]);
export type CallOutcome = z.infer<typeof CallOutcome>;
export const ObjectionType = z.enum(["price", "moq", "quality", "timing", "existing_supplier", "other", "none"]);
export type ObjectionType = z.infer<typeof ObjectionType>;
export const FinalAgentVariables = z.object({ outcome: CallOutcome.optional(), objection_type: ObjectionType.optional(), objection_quote: z.string().optional(), callback_time: z.string().optional() }).passthrough();
export type FinalAgentVariables = z.infer<typeof FinalAgentVariables>;
export const AgentVariables = z.object({ owner_name: z.string(), merchant_name: z.string(), seller_name: z.string(), seller_business: z.string(), rating_hook: z.string(), distance_km: z.string(), product: z.string(), price: z.string(), offer: z.string(), past_objections: z.string(), counter_offer: z.string() });
export type AgentVariables = z.infer<typeof AgentVariables>;
export const SarvamOutboundWebhook = z.object({
  attempt_id: z.string(),
  status: z.enum(["connected", "no_answer", "busy", "failed"]),
  channel_info: z.record(z.string(), z.unknown()).optional(),
  duration: z.number().nullable().optional(),
  interaction_id: z.string().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
  final_agent_variables: z.record(z.string(), z.unknown()).nullable().optional(),
  interaction_transcript: z.array(z.object({ role: z.string(), en_text: z.string(), text: z.string().optional(), language: z.string().optional() })).nullable().optional(),
  webhook_config: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type SarvamOutboundWebhook = z.infer<typeof SarvamOutboundWebhook>;
/** One call turn: `text` as spoken (Hindi, Tamil…), `en_text` the English version when Sarvam provides one. */
export type TranscriptTurn = { role: string; en_text: string; text?: string; language?: string };

/** Opening line sent per call as app_overrides.initial_bot_message (same text as the dashboard default). */
export function initialBotMessage(v: AgentVariables): string {
  return openingLine(v).replace(/ {2,}/g, " ");
}
function openingLine(v: AgentVariables): string {
  if (v.past_objections) return `Namaste ${v.owner_name} ji, main ${v.seller_business} se, ${v.seller_name} ji ki taraf se bol rahi hoon. Pichli baar aapne jo bola tha woh humne yaad rakha — ek naya offer hai aapke liye, ek minute milega?`;
  return `Namaste ${v.owner_name} ji, main ${v.seller_business} se, ${v.seller_name} ji ki taraf se bol rahi hoon — hum aapke paas hi, sirf ${v.distance_km} km door hain. Ek minute baat kar sakte hain?`;
}
const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : undefined);

const OUTCOME_SYNONYMS: Record<string, CallOutcome> = {
  sample: "sample_requested", sample_request: "sample_requested", free_sample: "sample_requested",
  not_intrested: "not_interested", uninterested: "not_interested", no_interest: "not_interested",
  call_back: "callback", call_later: "callback", follow_up: "callback",
};
const OBJECTION_SYNONYMS: Record<string, ObjectionType> = {
  pricing: "price", cost: "price", expensive: "price", bulk: "moq", quantity: "moq", min_order: "moq",
  supplier: "existing_supplier", competitor: "existing_supplier", time: "timing", no: "none", null: "none", "": "none",
};

/** Lenient parse of final_agent_variables: normalises enum casing/synonyms, drops invalid values, keeps extras. */
export function parseFinalVariables(raw: unknown): FinalAgentVariables {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  const outcomeKey = norm(obj.outcome);
  const outcome = outcomeKey ? CallOutcome.safeParse(OUTCOME_SYNONYMS[outcomeKey] ?? outcomeKey) : null;
  const objKey = norm(obj.objection_type);
  const objection = objKey !== undefined ? ObjectionType.safeParse(OBJECTION_SYNONYMS[objKey] ?? objKey) : null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() && !/^(null|none|n\/a|na)$/i.test(v.trim()) ? v.trim() : undefined);
  const out: Record<string, unknown> = { ...obj };
  delete out.outcome; delete out.objection_type; delete out.objection_quote; delete out.callback_time;
  if (outcome?.success) out.outcome = outcome.data;
  if (objection?.success) out.objection_type = objection.data;
  const quote = str(obj.objection_quote); if (quote) out.objection_quote = quote;
  const cb = str(obj.callback_time); if (cb) out.callback_time = cb;
  return FinalAgentVariables.parse(out);
}

const TIMEOUT_MS = 20_000;

export type SarvamConfig = {
  apiKey: string;
  base: string;          // https://apps.sarvam.ai (no trailing /api)
  orgId: string;
  workspaceId: string;
  appId: string;
  appVersion: number;
  connectionId: string;
  agentPhone: string;
  publicBaseUrl: string;
  webhookSecret: string;
};

export class SarvamConfigError extends Error {
  constructor(public missing: string[]) {
    super(`Sarvam is not configured. Missing env vars: ${missing.join(", ")}. Set them in .env, or use the in-app simulator.`);
    this.name = "SarvamConfigError";
  }
}

export class SarvamApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
    this.name = "SarvamApiError";
  }
}

const REQUIRED = [
  "SARVAM_API_KEY", "SARVAM_ORG_ID", "SARVAM_WORKSPACE_ID", "SARVAM_APP_ID", "SARVAM_APP_VERSION",
  "SARVAM_CONNECTION_ID", "SARVAM_AGENT_PHONE", "PUBLIC_BASE_URL", "VYAPAR_WEBHOOK_SECRET",
] as const;

/** Validates env and returns config; throws SarvamConfigError listing every missing var. */
export function sarvamConfig(env: Record<string, string | undefined> = process.env): SarvamConfig {
  const val = (k: string) => (env[k] ?? "").trim();
  const missing: string[] = REQUIRED.filter((k) => !val(k));
  const appVersion = Number(val("SARVAM_APP_VERSION"));
  if (val("SARVAM_APP_VERSION") && (!Number.isInteger(appVersion) || appVersion < 1)) missing.push("SARVAM_APP_VERSION (must be a positive integer)");
  for (const key of ["PUBLIC_BASE_URL", "SARVAM_VA_BASE"] as const) {
    if (!val(key)) continue;
    try { const url = new URL(val(key)); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) missing.push(`${key} (must be an HTTP(S) URL without credentials)`); }
    catch { missing.push(`${key} (must be an HTTP(S) URL)`); }
  }
  if (val("SARVAM_AGENT_PHONE") && !/^\+[1-9]\d{7,14}$/.test(normalizePhone(val("SARVAM_AGENT_PHONE")))) missing.push("SARVAM_AGENT_PHONE (must be E.164)");
  if (missing.length) throw new SarvamConfigError(missing);
  return {
    // The voice-agent platform (apps.sarvam.ai) can use a different key from the speech/chat API.
    apiKey: val("SARVAM_VA_API_KEY") || val("SARVAM_API_KEY"),
    base: (val("SARVAM_VA_BASE") || "https://apps.sarvam.ai").replace(/\/+$/, "").replace(/\/api$/, ""),
    orgId: val("SARVAM_ORG_ID"),
    workspaceId: val("SARVAM_WORKSPACE_ID"),
    appId: val("SARVAM_APP_ID"),
    appVersion,
    connectionId: val("SARVAM_CONNECTION_ID"),
    agentPhone: normalizePhone(val("SARVAM_AGENT_PHONE")),
    publicBaseUrl: val("PUBLIC_BASE_URL").replace(/\/+$/, ""),
    webhookSecret: val("VYAPAR_WEBHOOK_SECRET"),
  };
}

/** "+91 98200 12345" / "9820012345" → "+919820012345" (assumes India for bare 10-digit numbers). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return digits;
}

export function webhookUrlFor(cfg: Pick<SarvamConfig, "publicBaseUrl" | "webhookSecret">): string {
  return `${cfg.publicBaseUrl}/api/vyapar/webhooks/sarvam?secret=${encodeURIComponent(cfg.webhookSecret)}`;
}

type Fetch = typeof fetch;

async function request(url: string, init: RequestInit, cfg: SarvamConfig, fetchImpl: Fetch): Promise<unknown> {
  const res = await fetchImpl(url, {
    ...init,
    headers: { "Content-Type": "application/json", "X-API-Key": cfg.apiKey, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const b = body as { error?: { data?: { details?: unknown }; message?: string }; detail?: unknown } | null;
    const details = b?.error?.data?.details ?? b?.detail ?? body;
    throw new SarvamApiError(`Sarvam ${init.method ?? "GET"} ${new URL(url).pathname} failed: HTTP ${res.status} ${typeof details === "string" ? details : JSON.stringify(details)}`, res.status, details);
  }
  return body;
}

export type CreateOutboundInput = {
  phone: string;
  variables: AgentVariables;
  webhookUrl?: string;
  webhookMetadata?: Record<string, unknown>;
  initialBotMessage?: string;
  initialLanguageName?: "Hindi" | "English";
};

/** Places ONE outbound call. Never retried automatically (never double-dial). */
export async function createOutboundCall(input: CreateOutboundInput, deps: { config?: SarvamConfig; fetchImpl?: Fetch } = {}): Promise<{ attemptId: string }> {
  const cfg = deps.config ?? sarvamConfig();
  if (!/^\+[1-9]\d{7,14}$/.test(normalizePhone(input.phone))) throw new SarvamApiError("Recipient phone must be valid E.164", 400);
  const url = `${cfg.base}/api/outbounds/v1/orgs/${encodeURIComponent(cfg.orgId)}/workspaces/${encodeURIComponent(cfg.workspaceId)}/outbounds`;
  const overrides: Record<string, string> = {};
  if (input.initialBotMessage) overrides.initial_bot_message = input.initialBotMessage;
  if (input.initialLanguageName) overrides.initial_language_name = input.initialLanguageName;
  const body = {
    app_config: {
      app_type: "agent",
      app_id: cfg.appId,
      app_version: cfg.appVersion,
      connection_config: { connection_id: cfg.connectionId, agent_phone_number: cfg.agentPhone },
      // Published Vyapar SDR declares these alongside the 11 lead inputs. Reset result slots per attempt.
      agent_variables: { user_name: input.variables.owner_name, call_summary: "", callback_time: "", objection_quote: "",
        objection_type: "", outcome: "", ...input.variables },
      ...(Object.keys(overrides).length ? { app_overrides: overrides } : {}),
    },
    user_config: { user_phone_number: normalizePhone(input.phone) },
    ...(input.webhookUrl ? { webhook_config: { url: input.webhookUrl, metadata: input.webhookMetadata ?? null } } : {}),
  };
  const res = (await request(url, { method: "POST", body: JSON.stringify(body) }, cfg, deps.fetchImpl ?? fetch)) as { attempt_id?: string } | null;
  if (!res?.attempt_id) throw new SarvamApiError("Sarvam create outbound returned no attempt_id", 200, res);
  return { attemptId: res.attempt_id };
}

export type AttemptStatus = SarvamOutboundWebhook["status"];

/** Maps Analytics connectivity_status (free-form string) to the webhook status enum; null = unknown/in-progress. */
export function mapConnectivityStatus(raw: string | null | undefined): AttemptStatus | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/busy/.test(s)) return "busy";
  if (/no[\s_-]?answer|not[\s_-]?answer|unanswer|missed|no[\s_-]?response/.test(s)) return "no_answer";
  if (/fail|error|invalid|not[\s_-]?connect|reject|cancel|ndnc|dnd/.test(s)) return "failed";
  if (/connect|answer|complete|success/.test(s)) return "connected";
  return null;
}

/** Leniently extracts call turns from the (undocumented) transcripts response. Analytics returns `content` in the spoken language. */
export function parseTranscript(raw: unknown): TranscriptTurn[] {
  const pickArray = (v: unknown): unknown[] | null => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of ["interaction_transcript", "transcript", "messages", "turns", "conversation", "data", "items"]) {
        const found = pickArray(o[k]);
        if (found) return found;
      }
    }
    return null;
  };
  const arr = pickArray(raw) ?? [];
  return arr.flatMap((t) => {
    if (!t || typeof t !== "object") return [];
    const o = t as Record<string, unknown>;
    const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : undefined);
    const spoken = str(o.content) ?? str(o.text) ?? str(o.message) ?? str(o.transcript);
    const en = str(o.en_text) ?? spoken;
    if (!en) return [];
    const roleRaw = String(o.role ?? o.speaker ?? o.sender ?? "").toLowerCase();
    const role = /agent|bot|assistant|ai/.test(roleRaw) ? "agent" : "user";
    const language = str(o.language_name) ?? str(o.language);
    return [{ role, en_text: en, ...(spoken ? { text: spoken } : {}), ...(language && language !== "UNKNOWN" ? { language } : {}) }];
  });
}

/** The call transcript as spoken (Analytics), used when the webhook only carried the English version. */
export async function fetchTranscript(interactionId: string, opts: { config?: SarvamConfig; fetchImpl?: Fetch } = {}): Promise<TranscriptTurn[]> {
  const cfg = opts.config ?? sarvamConfig();
  const analytics = `${cfg.base}/api/analytics/v1/${encodeURIComponent(cfg.orgId)}/${encodeURIComponent(cfg.workspaceId)}/${encodeURIComponent(cfg.appId)}`;
  return parseTranscript(await request(`${analytics}/transcripts/${encodeURIComponent(interactionId)}`, { method: "GET" }, cfg, opts.fetchImpl ?? fetch));
}

export type PollResult = { terminal: boolean; payload: SarvamOutboundWebhook | null; raw: unknown };

/**
 * Webhook fallback: looks the attempt up via Analytics "Get attempts" (filtered by attempt_id) and, when it
 * connected, fetches the transcript. Returns a SarvamOutboundWebhook-shaped payload once terminal.
 */
export async function pollAttempt(attemptId: string, opts: { since?: Date; config?: SarvamConfig; fetchImpl?: Fetch } = {}): Promise<PollResult> {
  const cfg = opts.config ?? sarvamConfig();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const analytics = `${cfg.base}/api/analytics/v1/${encodeURIComponent(cfg.orgId)}/${encodeURIComponent(cfg.workspaceId)}/${encodeURIComponent(cfg.appId)}`;
  const since = opts.since ?? new Date(Date.now() - 24 * 3600_000);
  const qs = new URLSearchParams({
    start_datetime: new Date(since.getTime() - 5 * 60_000).toISOString(),
    end_datetime: new Date(Date.now() + 5 * 60_000).toISOString(),
    limit: "5",
    filter_conditions: JSON.stringify([{ id: "1", field: "attempt_id", operator: "equals", value: attemptId }]),
  });
  const res = (await request(`${analytics}/attempts?${qs}`, { method: "GET" }, cfg, fetchImpl)) as { items?: Record<string, unknown>[] } | null;
  const item = res?.items?.find((i) => i.attempt_id === attemptId);
  if (!item) return { terminal: false, payload: null, raw: res };
  const status = mapConnectivityStatus(item.connectivity_status as string | null);
  if (!status || (status === "connected" && !item.end_datetime)) return { terminal: false, payload: null, raw: item };
  const interactionId = (item.interaction_id as string | null) ?? null;
  let transcript: TranscriptTurn[] | null = null;
  if (status === "connected" && interactionId) {
    try {
      transcript = await fetchTranscript(interactionId, { config: cfg, fetchImpl });
    } catch { transcript = null; }
  }
  const payload: SarvamOutboundWebhook = {
    attempt_id: attemptId,
    status,
    channel_info: { channel_type: item.channel_type, channel_provider: item.channel_provider },
    duration: typeof item.duration_in_seconds === "number" ? item.duration_in_seconds : null,
    interaction_id: interactionId,
    failure_reason: (item.failure_reason as string | null) ?? null,
    final_agent_variables: (item.agent_variables as Record<string, unknown> | null) ?? null,
    interaction_transcript: transcript,
    webhook_config: null,
  };
  return { terminal: true, payload, raw: item };
}
