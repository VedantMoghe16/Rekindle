import { db } from "@/lib/db";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { isN8nVyaparConfigured, n8nVyapar } from "@/lib/providers/n8n";
import { choosePlays, stageAfterReply, type CounterPlay } from "@/lib/vyapar/counter";
import { firstName, tidyGreeting } from "@/lib/vyapar/pitch";
import { classifyReply, quoteFor, ReplyUnderstanding } from "@/lib/vyapar/replies";
import { OBJECTION_LABELS, STAGE_LABELS, type Stage } from "@/lib/vyapar/taxonomy";
import { estimateValue, getSeller, liveNow, remember, shortRef, viewMerchant } from "@/lib/vyapar/server/context";
import { logEvent } from "@/lib/vyapar/server/opportunities";
import { createOutboundCall, fetchTranscript, initialBotMessage, normalizePhone, parseFinalVariables, pollAttempt, sarvamConfig, SarvamConfigError, webhookUrlFor, type SarvamOutboundWebhook, type TranscriptTurn } from "@/lib/providers/sarvam-agent";
import { z } from "zod";
import { buildPayload, type Scenario } from "@/lib/vyapar/call-simulation";
import { demoChatId, isTelegramConfigured, tgSendText, tgSendVoice } from "@/lib/providers/telegram";

const REPLY_SYSTEM = `You read a Telegram reply from an Indian small-business owner (Hinglish, Hindi or English) to a supplier's pitch.
Classify intent: OBJECTION (pushback), WANTS_SAMPLE, WANTS_MEETING, PLACES_ORDER, QUESTION, INTERESTED or NOT_INTERESTED.
objection is the main pushback (null unless intent is OBJECTION or NOT_INTERESTED); secondaryObjection any second one.
quote MUST be an exact substring of the reply. Extract prices in rupees: askedPriceInr (what they want to pay) and competitorPriceInr (what their current supplier charges).
timing: any restock day, availability or "after Diwali" style timing, in short English, else null. summary: one short English line.`;

export type ThreadEvent =
  | { kind: "memory"; title: string; quote: string | null; tags: string[] }
  | { kind: "counter"; chosen: { label: string; winRate: number }; alternatives: { label: string; winRate: number }[] }
  | { kind: "stage"; from: string; to: string; note: string | null }
  | { kind: "action"; title: string; lines: string[]; provider: string };

async function understand(text: string): Promise<{ u: ReplyUnderstanding; provider: string }> {
  try {
    const result = await callStructured({ tier: "fast", schema: ReplyUnderstanding, schemaName: "VyaparReply", system: REPLY_SYSTEM, user: `REPLY: ${text}` });
    const u = result.data;
    if (!text.includes(u.quote)) u.quote = quoteFor(text, null);
    return { u, provider: result.provenance === "live" ? (result.provider === "anthropic" ? "claude" : result.provider) : "cached" };
  } catch (error) {
    if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] reply understanding via LLM failed, using rules: ${error instanceof Error ? error.message : error}`);
    return { u: classifyReply(text), provider: "rules" };
  }
}

/** A buyer reply arrives (Telegram in the demo; typed or simulated in the demo). */
export async function receiveReply(dealId: string, text: string) {
  const deal = await db.vyaparDeal.findUnique({ where: { id: dealId }, include: { merchant: true } });
  if (!deal) throw new Error("Deal not found");
  // The buyer spoke: queued follow-ups are cancelled and the last one gets credit for the reply.
  await import("@/lib/vyapar/server/followups").then((f) => f.onBuyerReply(dealId)).catch(() => null);
  const seller = await getSeller();
  const at = liveNow();
  await db.vyaparMessage.create({ data: { dealId, direction: "in", text, author: deal.merchant.ownerName, createdAt: at } });

  const { u, provider } = await understand(text);
  const OUTCOME: Record<string, string> = { WANTS_SAMPLE: "SAMPLE_REQUESTED", WANTS_MEETING: "MEETING_BOOKED", PLACES_ORDER: "ORDER_WON", NOT_INTERESTED: "NOT_INTERESTED", INTERESTED: "POSITIVE_REPLY" };
  // Demo replies are typed or simulated in the app, so outcomes are logged as simulated, never as live labels.
  await logEvent({ sellerId: seller.id, type: "REPLY_RECEIVED", merchantId: deal.merchantId, dealId, provenance: "simulated", meta: { intent: u.intent, objection: u.objection } });
  if (OUTCOME[u.intent]) await logEvent({ sellerId: seller.id, type: OUTCOME[u.intent], merchantId: deal.merchantId, dealId, provenance: "simulated" });
  const events: ThreadEvent[] = [];
  const memories: { kind: string; category: string | null; summary: string; quote: string | null }[] = [];

  if (u.objection && u.intent !== "NOT_INTERESTED") {
    memories.push({ kind: "OBJECTION", category: u.objection, summary: u.summary, quote: u.quote });
    events.push({ kind: "memory", title: "Objection saved to memory", quote: u.quote, tags: [OBJECTION_LABELS[u.objection], ...(u.secondaryObjection ? [`${OBJECTION_LABELS[u.secondaryObjection]}${u.competitorPriceInr ? ` @ ₹${u.competitorPriceInr}` : ""}`] : [])] });
  }
  if (u.intent === "NOT_INTERESTED") memories.push({ kind: "OBJECTION", category: "NOT_INTERESTED", summary: u.summary, quote: u.quote });
  if (u.timing) {
    memories.push({ kind: "TIMING", category: null, summary: u.timing, quote: quoteFor(text, /tareekh|tarikh|date/.test(text.toLowerCase()) ? /tareekh|tarikh|date/ : /baje|baad|mahine|month/) });
  }
  if (["WANTS_SAMPLE", "WANTS_MEETING", "PLACES_ORDER", "INTERESTED"].includes(u.intent)) {
    await db.vyaparMemory.updateMany({ where: { dealId, kind: "OBJECTION", resolved: false }, data: { resolved: true } });
  }
  for (const m of memories) await db.vyaparMemory.create({ data: { dealId, merchantId: deal.merchantId, ...m, verified: Boolean(m.quote && text.includes(m.quote)), createdAt: at } });

  const stage = stageAfterReply(u, deal.stage);
  if (stage !== deal.stage) events.push({ kind: "stage", from: STAGE_LABELS[deal.stage as Stage] ?? deal.stage, to: STAGE_LABELS[stage as Stage] ?? stage, note: u.timing });
  await db.vyaparDeal.update({ where: { id: dealId }, data: { stage, objection: u.objection ?? (stage === "OBJECTION" ? deal.objection : null), lastTouchAt: at, nextStep: u.summary } });

  const plays = choosePlays(u);
  const ctx = { buyerFirstName: firstName(deal.merchant.ownerName), sellerFirstName: seller.ownerFirstName, offers: seller.offers, understanding: u };
  const suggestion = { play: plays[0].id, label: plays[0].label, text: tidyGreeting(plays[0].render(ctx)), next: plays[0].next };
  if (u.intent === "OBJECTION" || u.intent === "QUESTION" || u.intent === "INTERESTED") {
    events.push({ kind: "counter", chosen: { label: plays[0].label, winRate: plays[0].winRate }, alternatives: plays.slice(1).map((p) => ({ label: p.label, winRate: p.winRate })) });
  }

  remember([{ id: `reply-${dealId}-${at.getTime()}`, text: `${deal.merchant.name} (${deal.merchant.category}) replied to ${seller.merchant.name}: "${text}". Understood as ${u.intent}${u.objection ? ` with objection ${OBJECTION_LABELS[u.objection]}` : ""}. ${u.timing ?? ""}` }]);

  let sent = false;
  if (deal.autopilot) {
    await sendMessage(dealId, suggestion.text, { play: plays[0], author: "Autopilot", provider: "template" }, events);
    sent = true;
  }
  return { understanding: u, provider, events, suggestion, sent };
}

/** Our outbound message. If it carries a play with a next step, the matching action is created. */
export async function sendMessage(dealId: string, text: string, opts: { play?: CounterPlay | null; author?: string; provider?: string } = {}, events: ThreadEvent[] = []) {
  const at = liveNow();
  const chat = await deliverToTelegram(dealId, text);
  await db.vyaparMessage.create({ data: { dealId, direction: "out", text, author: opts.author ?? "Rahul", provider: opts.provider ?? "human", createdAt: at, metaJson: JSON.stringify({ ...(opts.play ? { play: opts.play.id, winRate: opts.play.winRate } : {}), ...(chat ? { telegram: true, telegramChat: chat } : {}) }) } });
  await db.vyaparDeal.update({ where: { id: dealId }, data: { lastTouchAt: at } });
  if (opts.play?.next) events.push(await triggerAction(dealId, opts.play.next));
  return events;
}

const ACTION_COPY: Record<string, { title: string; lines: (merchant: string, area: string) => string[]; status: string; stage?: string }> = {
  SAMPLE_DISPATCH: { title: "Sample dispatch scheduled", lines: (_m, area) => ["Warehouse task · 25 bags + 10 pastry boxes", `Delivery tomorrow, 11:00 AM · ${area}`, "Follow-up reminder set before restock day"], status: "scheduled" },
  MEETING: { title: "Visit booked", lines: (_m, area) => [`Shop visit tomorrow, 5:00 PM · ${area}`, "Calendar invite + Google Meet backup link", "Sample kit added to the visit"], status: "scheduled" },
  PAYMENT_LINK: { title: "Paytm payment link sent", lines: () => ["Payment link via Paytm for Business", "Delivery booked for tomorrow morning", "Invoice with GST generated"], status: "sent", stage: "ORDER_WON" },
  FOLLOW_UP: { title: "Follow-up scheduled", lines: () => ["Reminder in 7 days", "Autopilot will re-engage with a fresh angle"], status: "scheduled" },
};

/** Hands the next step to n8n (warehouse, calendar, payments). Simulated, and labelled so, when n8n is not configured. */
export async function triggerAction(dealId: string, type: string, when?: string): Promise<ThreadEvent> {
  const deal = await db.vyaparDeal.findUniqueOrThrow({ where: { id: dealId }, include: { merchant: true } });
  const copy = ACTION_COPY[type] ?? ACTION_COPY.FOLLOW_UP;
  const lines = copy.lines(deal.merchant.name, deal.merchant.area);
  // Use the time the merchant actually agreed to (e.g. from the voice agent) instead of the default slot.
  if (when && lines.length > 1) lines[1] = `${type === "FOLLOW_UP" ? "Call back" : type === "MEETING" ? "Visit" : "Delivery"} ${when} · ${deal.merchant.area}`;
  let ref = shortRef(type === "PAYMENT_LINK" ? "PTM-LNK" : "VY");
  let provider = "simulated";
  if (isN8nVyaparConfigured()) {
    try {
      const result = await n8nVyapar("action.requested", { type, dealId, merchant: { id: deal.merchantId, name: deal.merchant.name, owner: deal.merchant.ownerName, area: deal.merchant.area, phone: deal.merchant.phoneMasked }, valueInr: deal.valueInr, lines });
      ref = result.ref ?? ref;
      provider = "n8n";
    } catch (error) {
      console.warn(`[vyapar] n8n action failed, simulating: ${error instanceof Error ? error.message : error}`);
    }
  }
  await db.vyaparAction.create({ data: { dealId, type, status: provider === "n8n" ? "queued" : copy.status, summary: `${copy.title} · ${lines[1] ?? lines[0]}`, payloadJson: JSON.stringify({ lines }), ref, provider, createdAt: liveNow() } });
  if (type === "SAMPLE_DISPATCH") await db.vyaparMemory.create({ data: { dealId, merchantId: deal.merchantId, kind: "COMMITMENT", summary: `We promised a free sample: ${lines[1]}`, createdAt: liveNow() } });
  if (copy.stage) await db.vyaparDeal.update({ where: { id: dealId }, data: { stage: copy.stage } });
  return { kind: "action", title: copy.title, lines: [`Task ${ref}`, ...lines], provider };
}

export async function getThread(dealId: string) {
  const deal = await db.vyaparDeal.findUnique({ where: { id: dealId }, include: { merchant: true, messages: { orderBy: { createdAt: "asc" } }, memories: { orderBy: { createdAt: "asc" } }, actions: { orderBy: { createdAt: "asc" } } } });
  if (!deal) return null;
  type Item =
    | { type: "message"; id: string; at: Date; direction: string; kind: string; text: string; author: string; provider: string | null; meta: Record<string, unknown> }
    | { type: "memory"; id: string; at: Date; kind: string; category: string | null; summary: string; quote: string | null; verified: boolean }
    | { type: "action"; id: string; at: Date; actionType: string; status: string; summary: string; ref: string | null; provider: string; lines: string[] };
  const items: Item[] = [
    ...deal.messages.map((m) => ({ type: "message" as const, id: m.id, at: m.createdAt, direction: m.direction, kind: m.kind, text: m.text, author: m.author, provider: m.provider, meta: JSON.parse(m.metaJson) as Record<string, unknown> })),
    ...deal.memories.filter((m) => m.kind !== "COMMITMENT").map((m) => ({ type: "memory" as const, id: m.id, at: new Date(m.createdAt.getTime() + 1), kind: m.kind, category: m.category, summary: m.summary, quote: m.quote, verified: m.verified })),
    ...deal.actions.map((a) => ({ type: "action" as const, id: a.id, at: new Date(a.createdAt.getTime() + 2), actionType: a.type, status: a.status, summary: a.summary, ref: a.ref, provider: a.provider, lines: (JSON.parse(a.payloadJson) as { lines?: string[] }).lines ?? [] })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  return { deal: { id: deal.id, stage: deal.stage, valueInr: deal.valueInr, autopilot: deal.autopilot, objection: deal.objection, nextStep: deal.nextStep }, merchant: viewMerchant(deal.merchant), items };
}
export type ThreadView = NonNullable<Awaited<ReturnType<typeof getThread>>>;

/** Scripted buyer replies for the live demo, chosen by where the conversation is. */
export function demoReplies(merchantName: string, stage: string): string[] {
  const karan = /karan/i.test(merchantName);
  if (stage === "PITCHED" || stage === "REPLIED") return karan
    ? ["Bhaiya rate zyada hai, ₹3 mein milega? Abhi wale supplier se ₹3.50 mein aata hai.", "Theek hai, pehle sample bhejo. Kal 11 baje tak cafe pe koi hoga. Har mahine 5 tareekh ko stock lete hain.", "30 din ka credit milega kya?"]
    : ["Rate zyada hai bhai, kam karo.", "Achha, price list bhejo.", "Theek hai, sample bhejo."];
  if (stage === "OBJECTION") return karan
    ? ["Theek hai, pehle sample bhejo. Kal 11 baje tak cafe pe koi hoga. Har mahine 5 tareekh ko stock lete hain.", "Nahi bhai, abhi zarurat nahi."]
    : ["Theek hai, sample bhejo.", "Kal shop pe aa jao, baat karte hain.", "Nahi chahiye abhi."];
  if (stage === "SAMPLE_REQUESTED" || stage === "SAMPLE_SENT" || stage === "MEETING_BOOKED") return ["Sample achha tha! 1000 bags bhej do, order confirm.", "Quality theek hai, par delivery time pe hogi na?"];
  return ["Achha, price list bhejo."];
}

export const CallResult = {
  outcomes: ["interested", "sample_requested", "objection", "not_interested", "callback"] as const,
  objections: ["price", "moq", "quality", "timing", "existing_supplier", "other", "none"] as const,
};
export type CallResultInput = { outcome: (typeof CallResult.outcomes)[number]; objection_type: (typeof CallResult.objections)[number]; objection_quote: string; callback_time: string };

const OBJECTION_MAP: Record<string, string> = { price: "PRICE_TOO_HIGH", moq: "BULK_ONLY_MOQ", quality: "QUALITY_DOUBT", timing: "NOT_NOW", existing_supplier: "HAS_SUPPLIER", other: "OTHER" };

const CallSummary = z.object({ summary: z.string(), nextStep: z.string() });
const SUMMARY_SYSTEM = `You summarise a sales call between Priya (an AI calling agent for a packaging supplier) and an Indian shop owner, for the supplier.
Write in plain, simple English that a busy shop owner understands at a glance, whatever language the call was in.
summary: 2-3 short sentences: what the owner said, their main concern or interest, and what was agreed. No jargon, no invented facts.
nextStep: one short line on what happens next.`;

/** Plain-language call summary (Gemini), falling back to the agent's structured outcome. */
async function summariseCall(transcript: TranscriptTurn[], ownerFirst: string, fallback: string) {
  if (transcript.length < 2) return { summary: fallback, nextStep: "", provider: "rules" };
  try {
    const lines = transcript.map((t) => `${t.role === "agent" ? "Priya" : ownerFirst}: ${t.text ?? t.en_text}`).join("\n");
    const result = await callStructured({ tier: "fast", schema: CallSummary, schemaName: "VyaparCallSummary", system: SUMMARY_SYSTEM, user: `Agent's recorded outcome: ${fallback}\n\nCALL:\n${lines}` });
    return { ...result.data, provider: result.provenance === "live" ? result.provider : "cached" };
  } catch (error) {
    if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] call summary via LLM failed: ${error instanceof Error ? error.message : error}`);
    return { summary: fallback, nextStep: "", provider: "rules" };
  }
}

/** Structured outcome from the Sarvam "Vyapar SDR" voice agent (docs/vyapar/sarvam-agent.md) → memory, stage, follow-up. */
export async function receiveCallResult(dealId: string, r: CallResultInput, transcript: TranscriptTurn[] = [], simulated = false, extra: { duration?: number | null } = {}) {
  const deal = await db.vyaparDeal.findUnique({ where: { id: dealId }, include: { merchant: true } });
  if (!deal) throw new Error("Deal not found");
  const seller = await getSeller();
  const at = liveNow();
  const summary = { interested: "Interested on the call", sample_requested: "Agreed to a free sample on the call", objection: "Raised an objection on the call", not_interested: "Not interested (call)", callback: `Asked for a callback${r.callback_time ? `: ${r.callback_time}` : ""}` }[r.outcome];
  const ownerFirst = firstName(deal.merchant.ownerName) || "Owner";
  await import("@/lib/vyapar/server/followups").then((f) => f.onBuyerReply(dealId)).catch(() => null);
  const outcomeLine = `${summary}${r.objection_quote ? `: "${r.objection_quote}"` : ""}`;
  const brief = await summariseCall(transcript, ownerFirst, outcomeLine);
  // The transcript is kept as spoken (Hindi, Tamil, Hinglish…); the summary is what the seller reads first.
  const turns = transcript.map((t) => ({ who: t.role === "agent" ? "Priya" : ownerFirst, role: t.role, text: t.text ?? t.en_text, en: t.text && t.en_text !== t.text ? t.en_text : null, language: t.language ?? null }));
  await db.vyaparMessage.create({ data: { dealId, direction: "in", kind: "call", text: brief.summary, author: deal.merchant.ownerName, provider: "sarvam-agent", metaJson: JSON.stringify({ ...r, outcomeLabel: summary, summary: brief.summary, nextStep: brief.nextStep, summaryBy: brief.provider, transcript: turns, simulated, duration: extra.duration ?? null }), createdAt: at } });
  const objection = r.objection_type !== "none" ? OBJECTION_MAP[r.objection_type] : null;
  if (objection || r.outcome === "not_interested") await db.vyaparMemory.create({ data: { dealId, merchantId: deal.merchantId, kind: "OBJECTION", category: r.outcome === "not_interested" ? "NOT_INTERESTED" : objection, summary, quote: r.objection_quote || null, verified: false, createdAt: at } });
  if (r.callback_time) await db.vyaparMemory.create({ data: { dealId, merchantId: deal.merchantId, kind: "TIMING", summary: r.outcome === "sample_requested" ? `Sample delivery: ${r.callback_time}` : `Call back: ${r.callback_time}`, quote: null, createdAt: at } });
  const stage = { interested: deal.stage === "PITCHED" ? "REPLIED" : deal.stage, sample_requested: "SAMPLE_REQUESTED", objection: "OBJECTION", not_interested: "LOST", callback: deal.stage === "PITCHED" ? "REPLIED" : deal.stage }[r.outcome];
  await db.vyaparDeal.update({ where: { id: dealId }, data: { stage, objection: objection ?? deal.objection, lastTouchAt: at, nextStep: summary } });
  await logEvent({ sellerId: seller.id, type: "CALL_RESULT", merchantId: deal.merchantId, dealId, provenance: "simulated", meta: { outcome: r.outcome, objection: r.objection_type } });
  if (r.outcome === "sample_requested") await triggerAction(dealId, "SAMPLE_DISPATCH", r.callback_time || undefined);
  if (r.outcome === "callback") await triggerAction(dealId, "FOLLOW_UP", r.callback_time || undefined);
  remember([{ id: `call-${dealId}-${at.getTime()}`, text: `AI call with ${deal.merchant.name}: ${summary}.${r.objection_quote ? ` They said: "${r.objection_quote}".` : ""}` }]);
  return { stage };
}

/** Input variables for the Sarvam agent, built only from shareable facts about this deal. */
export async function agentVariables(dealId: string) {
  const deal = await db.vyaparDeal.findUnique({ where: { id: dealId }, include: { merchant: true, memories: { orderBy: { createdAt: "desc" } } } });
  if (!deal) return null;
  const seller = await getSeller();
  const m = viewMerchant(deal.merchant);
  const web = m.profile.sources[0];
  // The call pitches the hero product (paper bags) so price, past objection and the bulk counter-offer all refer to the same item.
  const product = seller.offers.catalog.find((c) => c.sku === "PB-S") ?? seller.offers.catalog.find((c) => c.servesCategories.includes(m.category)) ?? seller.offers.catalog[0];
  const tier = seller.offers.tiers[0];
  const objections = deal.memories.filter((x) => x.kind === "OBJECTION");
  const km = Math.round(Math.hypot((m.lat - seller.merchant.lat) * 111, (m.lng - seller.merchant.lng) * 111 * Math.cos((m.lat * Math.PI) / 180)) * 10) / 10;
  return {
    owner_name: firstName(m.ownerName), merchant_name: m.name, seller_name: seller.ownerFirstName, seller_business: seller.merchant.name,
    rating_hook: web ? `${web.rating.toFixed(1)}★ on ${web.source}${m.profile.highlights[0] ? `, ${m.profile.highlights[0].toLowerCase()}` : ""}` : "",
    distance_km: String(km), product: product ? product.name.replace(/\s*\(.*\)/, "").toLowerCase() + "s" : seller.product, price: product ? `₹${product.unitPriceInr} per ${product.name.toLowerCase().includes("bag") ? "bag" : "piece"}` : "",
    offer: seller.offers.freeSample.enabled ? `Free sample: ${seller.offers.freeSample.contents}` : "",
    past_objections: objections.map((o) => `${o.summary}${o.quote ? ` ("${o.quote}")` : ""}`).join("; "),
    counter_offer: tier ? `₹${tier.unitPriceInr.toFixed(2)} each for ${tier.minQty.toLocaleString("en-IN")}+ pcs, plus a free sample` : "",
  };
}

// ---------- Live calls through the published Sarvam "Vyapar SDR" agent ----------

/** Only the demo buyer can be dialled: fictional merchants have no real numbers (DEMO_KARAN_PHONE = your own phone). */
function dialPhone(deal: { demoPhone: string | null }): string | null {
  // DECISION (demo): fictional merchants have no real numbers. A fleet run routes each target to a demo contact
  // (deal.demoPhone); otherwise every AI call rings the one demo phone.
  const demo = (deal.demoPhone || process.env.DEMO_CALL_PHONE || process.env.DEMO_KARAN_PHONE)?.trim();
  return demo ? normalizePhone(demo) : null;
}
const mask = (p: string | null) => (p ? `${p.slice(0, 3)}••••••${p.slice(-4)}` : "No phone configured");

export async function previewAgentCall(dealId: string) {
  const vars = await agentVariables(dealId);
  if (!vars) return null;
  const deal = await db.vyaparDeal.findUniqueOrThrow({ where: { id: dealId } });
  const phone = dialPhone(deal);
  const missing: string[] = [];
  try { sarvamConfig(); } catch (error) { if (error instanceof SarvamConfigError) missing.push(...error.missing); else throw error; }
  if (!phone) missing.push("DEMO_CALL_PHONE (the one demo phone every AI call rings)");
  return { variables: vars, initialBotMessage: initialBotMessage(vars), phoneMasked: mask(phone), missing, canCallLive: missing.length === 0 };
}

/**
 * Starts an AI call for a deal. "sarvam" places ONE real call (never retried; the result arrives on the webhook or
 * via Analytics polling). "simulated" builds a realistic Sarvam payload (teammate's scenarios) and runs it through
 * the same webhook processor, so the demo exercises the real code path without dialling.
 */
export async function startAgentCall(dealId: string, opts: { provider?: "sarvam" | "simulated"; scenario?: Scenario } = {}) {
  const provider = opts.provider ?? "sarvam";
  const preview = await previewAgentCall(dealId);
  if (!preview) throw new Error("Deal not found");
  if (provider === "simulated") {
    const attemptId = `sim-${Date.now().toString(36)}`;
    await db.vyaparAction.create({ data: { dealId, type: "AI_CALL", status: "dialing", summary: "AI call · Sarvam Vyapar SDR (simulated)", payloadJson: JSON.stringify({ lines: [`Opening: ${preview.initialBotMessage}`] }), ref: attemptId, provider: "simulated", createdAt: liveNow() } });
    const result = await processSarvamWebhook(buildPayload(attemptId, opts.scenario ?? "sample", preview.variables));
    return { attemptId, provider, phoneMasked: "simulated", result };
  }
  if (!preview.canCallLive) throw new SarvamConfigError(preview.missing);
  const deal = await db.vyaparDeal.findUniqueOrThrow({ where: { id: dealId } });
  const cfg = sarvamConfig();
  const { attemptId } = await createOutboundCall({ phone: dialPhone(deal)!, variables: preview.variables, webhookUrl: webhookUrlFor(cfg), webhookMetadata: { dealId, secret: cfg.webhookSecret }, initialBotMessage: preview.initialBotMessage, initialLanguageName: "Hindi" }, { config: cfg });
  await db.vyaparAction.create({ data: { dealId, type: "AI_CALL", status: "dialing", summary: `AI call · Sarvam Vyapar SDR · ${preview.phoneMasked}`, payloadJson: JSON.stringify({ lines: [`Calling ${preview.phoneMasked}`, `Opening: ${preview.initialBotMessage}`] }), ref: attemptId, provider: "sarvam", createdAt: liveNow() } });
  return { attemptId, provider, phoneMasked: preview.phoneMasked, result: null };
}

/** Webhook fallback: if the call is still "dialing", ask Sarvam Analytics and process the result once it is terminal. */
export async function pollAgentCall(attemptId: string) {
  const action = await db.vyaparAction.findFirst({ where: { type: "AI_CALL", ref: attemptId } });
  if (!action) return { status: "unknown" as const };
  if (action.status !== "dialing") return { status: action.status, dealId: action.dealId };
  if (action.provider !== "sarvam" || Date.now() - action.createdAt.getTime() < 15_000) return { status: "dialing", dealId: action.dealId };
  try {
    const polled = await pollAttempt(attemptId, { since: new Date(action.createdAt.getTime() - 60_000) });
    if (polled.terminal && polled.payload) { await processSarvamWebhook(polled.payload); return { status: "completed", dealId: action.dealId }; }
  } catch (error) {
    console.warn(`[vyapar] Sarvam analytics poll failed: ${error instanceof Error ? error.message : error}`);
  }
  return { status: "dialing", dealId: action.dealId };
}

/** Calling straight from a lead (Pitch → AI call): reuse the merchant's open deal or open one. */
export async function ensureDealForLead(leadId: string) {
  const lead = await db.vyaparLead.findUnique({ where: { id: leadId }, include: { merchant: true } });
  if (!lead) throw new Error("Lead not found");
  if (lead.dealId) return lead.dealId;
  const open = await db.vyaparDeal.findFirst({ where: { merchantId: lead.merchantId, stage: { notIn: ["LOST", "ORDER_WON"] } } });
  const at = liveNow();
  const deal = open ?? await db.vyaparDeal.create({ data: { merchantId: lead.merchantId, stage: "PITCHED", valueInr: estimateValue(lead.merchant.qrVolumeBand, 5), autopilot: true, lastTouchAt: at, nextStep: "AI call placed", createdAt: at } });
  await db.vyaparLead.update({ where: { id: leadId }, data: { status: "PITCHED", dealId: deal.id } });
  return deal.id;
}

/** Sarvam post-call webhook (or Analytics poll). Idempotent on attempt_id. */
export async function processSarvamWebhook(payload: SarvamOutboundWebhook) {
  const action = await db.vyaparAction.findFirst({ where: { type: "AI_CALL", ref: payload.attempt_id } });
  if (!action) return { ok: false, reason: "unknown attempt_id" };
  if (action.status !== "dialing") return { ok: true, duplicate: true };
  if (payload.status !== "connected") {
    await db.vyaparAction.update({ where: { id: action.id }, data: { status: payload.status, summary: `${action.summary} · ${payload.status.replace("_", " ")}` } });
    await db.vyaparMessage.create({ data: { dealId: action.dealId, direction: "in", kind: "call", text: `📞 AI call${action.provider === "simulated" ? " (simulated)" : ""} not connected (${payload.status.replace("_", " ")})${payload.failure_reason ? `: ${payload.failure_reason}` : ""}`, author: "Sarvam agent", provider: "sarvam-agent", metaJson: JSON.stringify({ attemptId: payload.attempt_id }), createdAt: liveNow() } });
    return { ok: true, status: payload.status };
  }
  const v = parseFinalVariables(payload.final_agent_variables ?? {});
  const outcome = v.outcome ?? (v.objection_type && v.objection_type !== "none" ? "objection" : "callback");
  let transcript: TranscriptTurn[] = payload.interaction_transcript ?? [];
  // The webhook carries English text; Analytics has the call as spoken. Prefer that for live calls.
  if (action.provider === "sarvam" && payload.interaction_id && !transcript.some((t) => t.text)) {
    try { const spoken = await fetchTranscript(payload.interaction_id); if (spoken.length) transcript = spoken; } catch { /* keep the webhook's version */ }
  }
  const result = await receiveCallResult(action.dealId, { outcome, objection_type: v.objection_type ?? "none", objection_quote: v.objection_quote ?? "", callback_time: v.callback_time ?? "" }, transcript, action.provider === "simulated", { duration: payload.duration });
  await db.vyaparAction.update({ where: { id: action.id }, data: { status: "completed", summary: `${action.summary} · ${outcome.replace("_", " ")}${payload.duration ? ` · ${Math.round(payload.duration)}s` : ""}` } });
  return { ok: true, status: "connected", outcome, stage: result.stage };
}

/** "Send on Telegram": deliver to the deal's routed demo chat (or the default demo chat). Returns the chat id, or null. */
export async function deliverToTelegram(dealId: string, text: string, voice?: Buffer | null): Promise<string | null> {
  if (!isTelegramConfigured()) return null;
  try {
    const deal = await db.vyaparDeal.findUnique({ where: { id: dealId }, include: { merchant: true } });
    const chat = deal?.demoChatId || demoChatId();
    const header = `💬 To ${deal?.merchant.name ?? "merchant"} (demo · via Vyapar AI)\n\n`;
    await tgSendText(header + text, chat);
    if (voice) await tgSendVoice(voice, `🎙️ Voice note for ${deal?.merchant.name ?? "merchant"}`, chat);
    return chat;
  } catch (error) {
    console.warn(`[vyapar] Telegram delivery failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/** Reply typed in a demo Telegram chat → buyer reply on the deal most recently messaged in that chat. */
export async function receiveTelegramReply(text: string, chatId: string) {
  const last = await db.vyaparMessage.findFirst({ where: { direction: "out", OR: [{ metaJson: { contains: `"telegramChat":"${chatId}"` } }, ...(chatId === demoChatId() ? [{ metaJson: { contains: '"telegram":true' } }] : [])] }, orderBy: { createdAt: "desc" } });
  if (!last) return null;
  return { dealId: last.dealId, ...(await receiveReply(last.dealId, text)) };
}
