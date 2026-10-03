import { db } from "@/lib/db";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { isN8nVyaparConfigured, n8nVyapar } from "@/lib/providers/n8n";
import { choosePlays, stageAfterReply, type CounterPlay } from "@/lib/vyapar/counter";
import { firstName } from "@/lib/vyapar/pitch";
import { classifyReply, quoteFor, ReplyUnderstanding } from "@/lib/vyapar/replies";
import { OBJECTION_LABELS, STAGE_LABELS, type Stage } from "@/lib/vyapar/taxonomy";
import { getSeller, liveNow, remember, shortRef, viewMerchant } from "@/lib/vyapar/server/context";
import { logEvent } from "@/lib/vyapar/server/opportunities";

const REPLY_SYSTEM = `You read a WhatsApp reply from an Indian small-business owner (Hinglish, Hindi or English) to a supplier's pitch.
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
    return { u, provider: result.provenance === "live" ? "claude" : "cached" };
  } catch (error) {
    if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] reply understanding via LLM failed, using rules: ${error instanceof Error ? error.message : error}`);
    return { u: classifyReply(text), provider: "rules" };
  }
}

/** A buyer reply arrives (WhatsApp webhook in production; typed or simulated in the demo). */
export async function receiveReply(dealId: string, text: string) {
  const deal = await db.vyaparDeal.findUnique({ where: { id: dealId }, include: { merchant: true } });
  if (!deal) throw new Error("Deal not found");
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
  const suggestion = { play: plays[0].id, label: plays[0].label, text: plays[0].render(ctx), next: plays[0].next };
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
  await db.vyaparMessage.create({ data: { dealId, direction: "out", text, author: opts.author ?? "Rahul", provider: opts.provider ?? "human", createdAt: at, metaJson: JSON.stringify(opts.play ? { play: opts.play.id, winRate: opts.play.winRate } : {}) } });
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
export async function triggerAction(dealId: string, type: string): Promise<ThreadEvent> {
  const deal = await db.vyaparDeal.findUniqueOrThrow({ where: { id: dealId }, include: { merchant: true } });
  const copy = ACTION_COPY[type] ?? ACTION_COPY.FOLLOW_UP;
  const lines = copy.lines(deal.merchant.name, deal.merchant.area);
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
