import { z } from "zod";
import { db } from "@/lib/db";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { haversineKm } from "@/lib/vyapar/geo";
import { firstName } from "@/lib/vyapar/pitch";
import { OBJECTION_LABELS, type Objection } from "@/lib/vyapar/taxonomy";
import { nextSlot, paymentProfile } from "@/lib/vyapar/contact-timing";
import { BENCHMARK, COHORT_LABELS, contentChecks, evaluateFollowup, POLICY, TEMPLATE_LABELS, templateScore, type Check, type Cohort, type Evaluation, type FollowupInput, type TemplateStats } from "@/lib/vyapar/followups";
import { getSeller, liveNow, remember, viewMerchant } from "@/lib/vyapar/server/context";
import { logEvent } from "@/lib/vyapar/server/opportunities";
import { deliverToTelegram, sendMessage } from "@/lib/vyapar/server/conversation";
import { isSarvamTtsConfigured, sarvamTts } from "@/lib/providers/sarvam";

/**
 * Follow-up agent service: plans follow-ups for silent deals (rules in lib/vyapar/followups.ts), personalises the
 * vetted template with Gemini under the same guardrails, queues them for approval (or auto-sends low-risk ones at the
 * shop's quietest hour), cancels them the moment the buyer replies, and tracks which templates get replies.
 */

const OPEN = ["PROPOSED", "APPROVED"];
const HELD: Record<string, string> = { promise_wait: "Waiting for the date they gave", opt_out: "Asked us to stop", our_turn: "Waiting on your reply", gap: "Followed up recently", cap: "3 follow-ups unanswered", cooldown: "Too soon after losing it", reason: "Nothing new to say", fresh: "Already tried every angle" };
const DAY = 86_400_000;

export async function getFollowupSettings() {
  return (await db.followupSettings.findUnique({ where: { id: "default" } })) ?? db.followupSettings.create({ data: { id: "default" } });
}
export async function saveFollowupSettings(mode: "review" | "auto" | "off") {
  await db.followupSettings.upsert({ where: { id: "default" }, create: { id: "default", mode }, update: { mode } });
  // Switching to auto approves the low-risk drafts already waiting; switching off parks everything.
  if (mode === "auto") await db.vyaparFollowup.updateMany({ where: { status: "PROPOSED", risk: "low" }, data: { status: "APPROVED", autoApproved: true, decidedAt: liveNow() } });
  if (mode === "off") await db.vyaparFollowup.updateMany({ where: { status: "APPROVED", autoApproved: true }, data: { status: "PROPOSED", autoApproved: false } });
  return getFollowupSettings();
}

/** The seller's own results per template: sent, and how many got a reply. Feeds template choice. */
function ownStats(rows: { status: string; templateId: string; repliedAt: Date | null }[]): TemplateStats {
  const out: TemplateStats = {};
  for (const f of rows.filter((r) => r.status === "SENT")) { const s = (out[f.templateId] ??= { sent: 0, replied: 0 }); s.sent++; if (f.repliedAt) s.replied++; }
  return out;
}

type DealWithAll = Awaited<ReturnType<typeof loadDeals>>[number];
async function loadDeals() {
  return db.vyaparDeal.findMany({ include: { merchant: true, messages: { orderBy: { createdAt: "asc" } }, memories: true } });
}

function inputFor(deal: DealWithAll, seller: Awaited<ReturnType<typeof getSeller>>, sent: { at: Date; templateId: string }[]): FollowupInput {
  const m = viewMerchant(deal.merchant);
  return {
    stage: deal.stage, objection: deal.objection, ownerFirst: firstName(deal.merchant.ownerName), sellerFirst: seller.ownerFirstName, sellerName: seller.merchant.name, sellerGender: seller.persona.gender,
    distanceKm: Math.round(haversineKm(seller.merchant, deal.merchant) * 10) / 10,
    // Call results are logged as inbound "call" messages; they count as the buyer speaking.
    messages: deal.messages.map((x) => ({ direction: x.direction === "in" ? "in" : "out", at: x.createdAt, text: x.text })),
    memories: deal.memories.map((x) => ({ kind: x.kind, category: x.category, summary: x.summary, createdAt: x.createdAt })),
    signals: m.signals, sent, lostAt: deal.stage === "LOST" ? deal.lastTouchAt : null,
  };
}

const Personal = z.object({ text: z.string() });
const PERSONAL_SYSTEM = `You polish a follow-up message from a small Indian packaging supplier to a shop owner who went quiet.
Rewrite the TEMPLATE in warm, natural Hinglish (Roman script), as a real person would text. You may reference what the buyer said before.
Write in the seller's voice and gender: the template already uses the right Hindi verb forms (e.g. "bhejta/bhejti hoon"), keep them.
Rules: keep every fact, price and offer exactly as in the template; add NO new prices, discounts, dates or claims; at most 50 words;
exactly one question; no pressure ("last chance", "urgent"); never mention their payments, sales or transactions; no hashtags.`;

/** Gemini personalises the vetted template; anything that fails the guardrails falls back to the template. */
async function personalise(template: string, deal: DealWithAll, reason: string, offers: Awaited<ReturnType<typeof getSeller>>["offers"]) {
  const said = [...deal.messages].reverse().find((m) => m.direction === "in" && m.kind !== "call")?.text;
  const objection = deal.objection ? OBJECTION_LABELS[deal.objection as Objection] ?? deal.objection : null;
  try {
    const r = await callStructured({ tier: "fast", schema: Personal, schemaName: "VyaparFollowup", system: PERSONAL_SYSTEM, user: `SHOP: ${deal.merchant.name} (${deal.merchant.category}), owner ${firstName(deal.merchant.ownerName) || "unknown"}.\nWHY WE'RE WRITING: ${reason}\n${objection ? `THEIR CONCERN: ${objection}\n` : ""}${said ? `THEY LAST SAID: "${said}"\n` : ""}TEMPLATE: ${template}` });
    const text = r.data.text.trim();
    // The personalised text must keep the template's prices and pass every content check.
    const prices = (s: string) => [...s.matchAll(/₹\s?(\d+(?:\.\d+)?)/g)].map((m) => m[1]).sort().join(",");
    const failed = contentChecks(text, offers, 50).filter((c) => !c.ok);
    if (!failed.length && prices(text) === prices(template)) return { text, provider: r.provenance === "live" ? r.provider : "cached" };
    console.warn(`[vyapar] follow-up personalisation rejected (${failed.map((c) => c.id).join(", ") || "prices changed"}), using template`);
  } catch (error) {
    if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] follow-up personalisation failed: ${error instanceof Error ? error.message : error}`);
  }
  return { text: template, provider: "template" };
}

let planning: Promise<{ planned: number }> | null = null;
/** Scans every deal and queues a follow-up where the rules allow one. Idempotent: one open follow-up per deal; one scan at a time. */
export function planFollowups() {
  planning ??= planOnce().finally(() => { planning = null; });
  return planning;
}
async function planOnce() {
  const settings = await getFollowupSettings();
  if (settings.mode === "off") return { planned: 0 };
  const seller = await getSeller();
  const now = liveNow();
  const [deals, all] = await Promise.all([loadDeals(), db.vyaparFollowup.findMany({ orderBy: { createdAt: "asc" } })]);
  const today = all.filter((f) => f.status !== "SKIPPED" && f.status !== "CANCELLED" && now.getTime() - f.createdAt.getTime() < DAY).length;
  const stats = ownStats(all);
  let planned = 0;
  for (const deal of deals) {
    if (today + planned >= settings.dailyCap) break;
    const mine = all.filter((f) => f.dealId === deal.id);
    if (mine.some((f) => OPEN.includes(f.status))) continue;
    // A follow-up you skipped is not offered again for the same gap.
    const skipped = mine.filter((f) => f.status === "SKIPPED").at(-1);
    if (skipped && now.getTime() - (skipped.decidedAt ?? skipped.createdAt).getTime() < POLICY.gapDays * DAY) continue;
    const sent = mine.filter((f) => f.status === "SENT").map((f) => ({ at: f.sentAt ?? f.createdAt, templateId: f.templateId }));
    const e = evaluateFollowup(inputFor(deal, seller, sent), seller.offers, now, POLICY, stats);
    if (!e.eligible) continue;
    const polished = await personalise(e.text, deal, e.reason.text, seller.offers);
    const checks: Check[] = [...e.checks.filter((c) => !["length", "prices", "private", "pressure", "one_ask"].includes(c.id)), ...contentChecks(polished.text, seller.offers)];
    const slot = nextSlot("quiet", paymentProfile({ id: deal.merchantId, category: deal.merchant.category, qrVolumeBand: deal.merchant.qrVolumeBand }), now);
    const auto = settings.mode === "auto" && e.risk === "low";
    await db.vyaparFollowup.create({ data: { dealId: deal.id, cohort: e.cohort, attempt: e.attempt, templateId: e.templateId, reason: e.reason.text, text: polished.text, status: auto ? "APPROVED" : "PROPOSED", autoApproved: auto, risk: e.risk, channel: e.channel, whyJson: JSON.stringify(e.why), checksJson: JSON.stringify(checks), provider: polished.provider, scheduledFor: slot.at, timingNote: slot.note, createdAt: now } });
    planned++;
  }
  return { planned };
}

/** Sends approved follow-ups whose time has come, re-checking that it is still safe (they may have replied). */
export async function runDueFollowups() {
  const now = liveNow();
  const due = await db.vyaparFollowup.findMany({ where: { status: "APPROVED", scheduledFor: { lte: now } }, orderBy: { scheduledFor: "asc" } });
  const seller = due.length ? await getSeller() : null;
  let sent = 0;
  for (const f of due) {
    const deal = await db.vyaparDeal.findUnique({ where: { id: f.dealId }, include: { merchant: true, messages: { orderBy: { createdAt: "asc" } }, memories: true } });
    if (!deal || !seller) continue;
    const replied = deal.messages.some((m) => m.direction === "in" && m.createdAt > f.createdAt);
    const optOut = evaluateFollowup(inputFor(deal, seller, []), seller.offers, now).checks.find((c) => c.id === "opt_out" && !c.ok);
    if (replied || optOut || ["ORDER_WON", "MEETING_BOOKED", "SAMPLE_REQUESTED"].includes(deal.stage)) {
      await db.vyaparFollowup.update({ where: { id: f.id }, data: { status: "CANCELLED", note: replied ? "They replied first" : optOut ? "They asked us to stop" : "Deal moved forward" } });
      continue;
    }
    const author = f.autoApproved ? "Vyapar AI · auto follow-up" : "Vyapar AI · follow-up (approved)";
    if (f.channel === "voice") {
      // Voice note (Sarvam Bulbul) for leads who haven't been reading texts; the text rides along as the caption.
      const wav = isSarvamTtsConfigured() ? await sarvamTts(f.text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ""), seller.persona.speaker).catch(() => null) : null;
      const chat = await deliverToTelegram(f.dealId, f.text, wav, { voiceOnly: true });
      await db.vyaparMessage.create({ data: { dealId: f.dealId, direction: "out", kind: wav ? "voice" : "text", text: f.text, author, provider: wav ? "sarvam-tts" : f.provider, metaJson: JSON.stringify(chat ? { telegram: true, telegramChat: chat } : {}), createdAt: liveNow() } });
      await db.vyaparDeal.update({ where: { id: f.dealId }, data: { lastTouchAt: liveNow() } });
    } else {
      await sendMessage(f.dealId, f.text, { author, provider: f.provider === "template" ? "template" : f.provider });
    }
    await db.vyaparFollowup.update({ where: { id: f.id }, data: { status: "SENT", sentAt: liveNow() } });
    await db.vyaparDeal.update({ where: { id: f.dealId }, data: { nextStep: `Follow-up ${f.attempt} sent (${COHORT_LABELS[f.cohort as Cohort].toLowerCase()})` } });
    await logEvent({ sellerId: seller.id, type: "FOLLOWUP_SENT", merchantId: deal.merchantId, dealId: deal.id, meta: { templateId: f.templateId, cohort: f.cohort, attempt: f.attempt, auto: f.autoApproved } });
    remember([{ id: `followup-${f.id}`, dealId: f.dealId, text: `Follow-up ${f.attempt} to ${deal.merchant.name} (${COHORT_LABELS[f.cohort as Cohort]}). Reason: ${f.reason}. Message: ${f.text}` }]);
    sent++;
  }
  return { sent };
}

export async function approveFollowup(id: string, opts: { text?: string; sendNow?: boolean } = {}) {
  const f = await db.vyaparFollowup.findUnique({ where: { id } });
  if (!f || !OPEN.includes(f.status)) throw new Error("This follow-up is no longer waiting");
  const seller = await getSeller();
  const text = opts.text?.trim() || f.text;
  const failed = contentChecks(text, seller.offers).filter((c) => !c.ok);
  if (failed.length) throw new Error(`Edit needed: ${failed.map((c) => c.detail).join("; ")}`);
  await db.vyaparFollowup.update({ where: { id }, data: { status: "APPROVED", text, provider: text === f.text ? f.provider : "human", decidedAt: liveNow(), ...(opts.sendNow ? { scheduledFor: liveNow(), timingNote: "Sent now by you" } : {}) } });
  if (opts.sendNow) await runDueFollowups();
  return db.vyaparFollowup.findUniqueOrThrow({ where: { id } });
}

export async function skipFollowup(id: string, note?: string) {
  await db.vyaparFollowup.update({ where: { id }, data: { status: "SKIPPED", decidedAt: liveNow(), note: note ?? "Skipped by you" } });
}

/** A buyer replied: cancel anything queued and credit the last follow-up with the reply. */
export async function onBuyerReply(dealId: string) {
  const at = liveNow();
  await db.vyaparFollowup.updateMany({ where: { dealId, status: { in: OPEN } }, data: { status: "CANCELLED", note: "They replied first" } });
  const last = await db.vyaparFollowup.findFirst({ where: { dealId, status: "SENT", repliedAt: null }, orderBy: { sentAt: "desc" } });
  if (last && last.sentAt && at.getTime() - last.sentAt.getTime() < 7 * DAY) await db.vyaparFollowup.update({ where: { id: last.id }, data: { repliedAt: at } });
}

/** Queue for the Follow-ups screen: waiting for you, scheduled, recent results, and who we're deliberately not messaging. */
export async function getFollowupQueue() {
  const seller = await getSeller();
  const now = liveNow();
  const [settings, rows, deals] = await Promise.all([getFollowupSettings(), db.vyaparFollowup.findMany({ orderBy: { createdAt: "desc" }, take: 60 }), loadDeals()]);
  const byId = new Map(deals.map((d) => [d.id, d]));
  const view = (f: (typeof rows)[number]) => {
    const d = byId.get(f.dealId);
    return { ...f, why: f.whyJson ? (JSON.parse(f.whyJson) as { template: string; channel: string }) : null, checks: JSON.parse(f.checksJson) as Check[], cohortLabel: COHORT_LABELS[f.cohort as Cohort] ?? f.cohort, merchant: d ? { id: d.merchantId, name: d.merchant.name, category: d.merchant.category } : null, silentDays: d ? Math.floor((now.getTime() - (d.messages.at(-1)?.createdAt ?? d.lastTouchAt).getTime()) / DAY) : 0 };
  };
  // Silent deals the agent is deliberately leaving alone, with the guardrail that stopped it.
  const held: { dealId: string; name: string; why: string }[] = [];
  for (const d of deals) {
    if (rows.some((f) => f.dealId === d.id && OPEN.includes(f.status))) continue;
    const sent = rows.filter((f) => f.dealId === d.id && f.status === "SENT").map((f) => ({ at: f.sentAt ?? f.createdAt, templateId: f.templateId }));
    const e: Evaluation = evaluateFollowup(inputFor(d, seller, sent), seller.offers, now, POLICY, ownStats(rows));
    if (!e.eligible && e.blockedBy && e.cohort && e.blockedBy.id !== "silence") held.push({ dealId: d.id, name: d.merchant.name, why: `${HELD[e.blockedBy.id] ?? e.blockedBy.label}: ${e.blockedBy.detail}` });
  }
  const sentRows = rows.filter((f) => f.status === "SENT");
  const own = ownStats(rows);
  // What works: every template's reply rate (your results blended with the demo benchmark), best first.
  const templates = Object.keys(BENCHMARK).map((id) => { const sc = templateScore(id, own); return { id, label: TEMPLATE_LABELS[id] ?? id, rate: Math.round(sc.rate * 100), sent: sc.ownSent, replied: sc.ownReplied }; }).sort((a, b) => b.rate - a.rate);
  return {
    settings,
    waiting: rows.filter((f) => f.status === "PROPOSED").map(view),
    scheduled: rows.filter((f) => f.status === "APPROVED").map(view),
    history: rows.filter((f) => ["SENT", "SKIPPED", "CANCELLED"].includes(f.status)).slice(0, 15).map(view),
    held,
    stats: { sent: sentRows.length, replied: sentRows.filter((f) => f.repliedAt).length, templates },
  };
}

// Background worker: plans and sends due follow-ups every minute while the app is running.
let timer: ReturnType<typeof setInterval> | null = null;
export function ensureFollowupWorker() {
  if (timer) return;
  const tick = () => planFollowups().then(runDueFollowups).catch((error) => console.warn("[vyapar] follow-up tick failed:", error));
  timer = setInterval(tick, 60_000);
  void tick();
}
