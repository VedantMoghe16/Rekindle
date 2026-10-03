import { z } from "zod";
import { db } from "@/lib/db";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { getSeller, liveNow, remember } from "@/lib/vyapar/server/context";
import { createHunt, getHunt } from "@/lib/vyapar/server/hunts";
import { getPitch, sendPitch } from "@/lib/vyapar/server/pitches";
import { pollAgentCall, startAgentCall } from "@/lib/vyapar/server/conversation";
import { getOnboarding } from "@/lib/vyapar/server/onboarding";
import type { HuntLead } from "@/lib/vyapar/server/opportunities";
import { hourLabel, nextSlot, paymentProfile, type TimingStrategy } from "@/lib/vyapar/contact-timing";

/**
 * Autonomous AI sales team ("fleet"): one button runs
 *   understand business → find businesses → AI re-rank → write pitches → send on Telegram → call one by one → report.
 * Calls are strictly sequential: priority 1 is called and its result recorded before priority 2 is dialled.
 * Every step is saved (FleetRun / FleetTarget) and the outcome is written to the business memory (Cognee).
 */

export const DEFAULT_CONTACTS = [
  { priority: 1, label: "Priority 1", phone: process.env.DEMO_CALL_PHONE || "+919755812313", telegramChatId: process.env.VYAPAR_TELEGRAM_CHAT_ID || "2145717919" },
  { priority: 2, label: "Priority 2", phone: null as string | null, telegramChatId: null as string | null },
];

export async function getDemoContacts() {
  const rows = await db.demoContact.findMany({ orderBy: { priority: "asc" } });
  if (rows.length) return rows;
  for (const c of DEFAULT_CONTACTS) await db.demoContact.create({ data: c });
  return db.demoContact.findMany({ orderBy: { priority: "asc" } });
}

export async function saveDemoContacts(contacts: { priority: number; phone: string | null; telegramChatId: string | null }[]) {
  for (const c of contacts) await db.demoContact.upsert({ where: { priority: c.priority }, create: { priority: c.priority, label: `Priority ${c.priority}`, phone: c.phone, telegramChatId: c.telegramChatId }, update: { phone: c.phone, telegramChatId: c.telegramChatId } });
  return getDemoContacts();
}

const Rerank = z.object({ ranked: z.array(z.object({ merchantId: z.string(), why: z.string().max(200), bestTime: z.string().max(80) })).max(8) });

/** AI re-ranker over the rules shortlist: picks who to contact first and the best time to reach them. Falls back to rules order. */
export async function rerank(candidates: HuntLead[], brief: { summary: string; pitchAngle: string }, n: number) {
  const fallback = candidates.slice(0, n).map((c) => ({ lead: c, why: `${c.opp.hypothesis}. ${c.opp.timing.status === "fresh" ? c.opp.timing.label : `Relevance ${c.opp.relevance}`}.`, bestTime: /bakery|sweet|cafe/i.test(c.merchant.category) ? "3–5 pm, after the lunch rush" : "11 am–12 pm, before lunch orders" }));
  try {
    const { data } = await callStructured({
      tier: "fast", schema: Rerank, schemaName: "VyaparFleetRerank",
      system: "You are the planner of an AI sales team for a small Indian supplier. Order the candidate shops by who is most worth contacting today. Prefer a real, dated reason to buy now, a strong product fit and closeness. For each, give one plain-language reason and the best time of day to call a shop like this. Use only the given facts; use the exact merchantId values.",
      user: `BUSINESS: ${brief.summary}\nPITCH ANGLE: ${brief.pitchAngle}\nCANDIDATES:\n${candidates.map((c) => `- merchantId=${c.merchant.id} | ${c.merchant.name} (${c.merchant.category}, ${c.opp.distanceKm} km) | why now: ${c.opp.timing.label} | evidence: ${c.opp.whyMerchant.slice(0, 3).map((e) => e.claim).join("; ")} | relevance ${c.opp.relevance}`).join("\n")}\nReturn the best ${n} first.`,
    });
    const picked = data.ranked.map((r) => ({ lead: candidates.find((c) => c.merchant.id === r.merchantId), why: r.why, bestTime: r.bestTime })).filter((r): r is { lead: HuntLead; why: string; bestTime: string } => Boolean(r.lead));
    const unique = picked.filter((r, i) => picked.findIndex((x) => x.lead.merchant.id === r.lead.merchant.id) === i);
    return unique.length ? [...unique, ...fallback.filter((f) => !unique.some((u) => u.lead.merchant.id === f.lead.merchant.id))].slice(0, n) : fallback;
  } catch (error) {
    if (!(error instanceof LlmOfflineMiss)) console.warn(`[vyapar] fleet re-rank via LLM failed, using rules order: ${error instanceof Error ? error.message : error}`);
    return fallback;
  }
}

const workers = new Set<string>();

export class FleetCancelled extends Error {}
async function checkCancelled(runId: string) {
  const r = await db.fleetRun.findUnique({ where: { id: runId }, select: { status: true } });
  if (!r || r.status === "CANCELLED") throw new FleetCancelled("cancelled");
}

/** Runs (or resumes) a fleet run in the background. Safe to call twice: each step skips work already done. */
function launch(runId: string) {
  if (workers.has(runId)) return;
  workers.add(runId);
  void runFleet(runId)
    .catch(async (error) => {
      if (error instanceof FleetCancelled) return;
      console.error("[vyapar] fleet run failed", error);
      await db.fleetRun.update({ where: { id: runId }, data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), finishedAt: liveNow() } });
    })
    .finally(() => workers.delete(runId));
}

/**
 * Starts outreach. From search results (huntId + leadIds) the team contacts exactly the shops shown to the merchant;
 * without them it runs its own search from the business brief. One run at a time.
 */
export async function startFleet(opts: { callMode: "live" | "simulated"; timing?: TimingStrategy; huntId?: string | null; leadIds?: string[] | null }) {
  const running = await db.fleetRun.findFirst({ where: { status: "RUNNING" }, orderBy: { createdAt: "desc" } });
  if (running) { launch(running.id); return { runId: running.id, alreadyRunning: true }; }
  const seller = await getSeller();
  const hunt = opts.huntId ? await db.vyaparHunt.findUnique({ where: { id: opts.huntId } }) : null;
  const goal = hunt?.prompt ?? (await getOnboarding()).brief.huntPrompt;
  const run = await db.fleetRun.create({ data: { sellerId: seller.id, goal, huntId: hunt?.id ?? null, leadIdsJson: opts.leadIds?.length ? JSON.stringify(opts.leadIds.slice(0, 5)) : null, callMode: opts.callMode, timing: opts.timing ?? "quiet", createdAt: liveNow() } });
  launch(run.id);
  return { runId: run.id, alreadyRunning: false };
}

export async function recentRuns(limit = 6) {
  const runs = await db.fleetRun.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { targets: { select: { outcome: true } } } });
  return runs.map((r) => ({ id: r.id, goal: r.goal, status: r.status, createdAt: r.createdAt, shops: r.targets.length, samples: r.targets.filter((t) => t.outcome === "sample_requested").length }));
}

/** Stop button: no new messages or calls start. A call already ringing finishes and is still recorded. */
export async function cancelFleet(runId: string) {
  const run = await db.fleetRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "RUNNING") return run?.status ?? "NOT_FOUND";
  await db.fleetRun.update({ where: { id: runId }, data: { status: "CANCELLED", step: "Stopped by you", finishedAt: liveNow() } });
  await db.fleetTarget.updateMany({ where: { runId, telegramStatus: { in: ["PENDING", "SCHEDULED"] } }, data: { telegramStatus: "CANCELLED" } });
  await db.fleetTarget.updateMany({ where: { runId, callStatus: { in: ["QUEUED", "SCHEDULED"] } }, data: { callStatus: "CANCELLED", result: "Stopped before contact." } });
  return "CANCELLED";
}

/** Resume runs whose background worker died (e.g. a server restart) when someone looks at them. */
export function ensureWorker(run: { id: string; status: string }) {
  if (run.status === "RUNNING") launch(run.id);
}

const step = (runId: string, text: string) => db.fleetRun.update({ where: { id: runId }, data: { step: text } });

async function runFleet(runId: string) {
  const run = await db.fleetRun.findUniqueOrThrow({ where: { id: runId } });
  const { brief } = await getOnboarding();
  const contacts = await getDemoContacts();
  const chosen: string[] | null = run.leadIdsJson ? JSON.parse(run.leadIdsJson) : null;
  const n = chosen ? chosen.length : Math.max(2, Math.min(3, contacts.filter((c) => c.phone || c.telegramChatId).length));

  // 1–3. Find, re-rank, plan timing (only once per run).
  if (!(await db.fleetTarget.count({ where: { runId } }))) {
    await checkCancelled(runId);
    await step(runId, chosen ? "Picking up the shops you chose" : "Finding businesses near you");
    const huntId = run.huntId ?? (await createHunt(run.goal));
    await db.fleetRun.update({ where: { id: runId }, data: { huntId } });
    const hunt = await getHunt(huntId);
    const known = new Set((await db.vyaparDeal.findMany({ select: { merchantId: true } })).map((d) => d.merchantId));
    const reachable = chosen
      ? chosen.map((id) => hunt?.shortlist.find((l) => l.id === id)).filter((l): l is HuntLead => Boolean(l && !l.dealId))
      : (hunt?.shortlist ?? []).filter((l) => l.opp.action === "pitch" && !known.has(l.merchant.id)).slice(0, 8);
    if (!reachable.length) throw new Error("No reachable new businesses found. Check the onboarding answers.");
    await checkCancelled(runId);
    await step(runId, chosen ? `Ranking who to contact first among your ${reachable.length} shops` : `Ranking the best ${n} of ${reachable.length} businesses to contact`);
    const picked = await rerank(reachable, brief, Math.min(n, reachable.length));
    const now = liveNow();
    for (const [i, p] of picked.entries()) {
      const profile = paymentProfile({ id: p.lead.merchant.id, category: p.lead.merchant.category, qrVolumeBand: p.lead.merchant.qrVolumeBand });
      const slot = nextSlot((run.timing as TimingStrategy) || "quiet", profile, now);
      await db.fleetTarget.create({ data: { runId, priority: i + 1, merchantId: p.lead.merchant.id, leadId: p.lead.id, why: p.why, bestTime: slot.hour != null ? hourLabel(slot.hour) : "now", scheduledFor: slot.at, timingNote: slot.note, hoursJson: null, telegramStatus: "SCHEDULED", callStatus: "SCHEDULED" } });
    }
  }

  // 4. Pitches for everyone up front (so they are ready at each shop's time).
  const pending = await db.fleetTarget.findMany({ where: { runId, pitch: null }, orderBy: { priority: "asc" } });
  if (pending.length) {
    await checkCancelled(runId);
    await step(runId, "Writing a personal pitch for each business");
    for (const t of pending) {
      const pitch = await getPitch(t.leadId!).catch(() => null);
      await db.fleetTarget.update({ where: { id: t.id }, data: { pitch: pitch?.pitch.text ?? "" } });
    }
  }

  // 5. At each shop's time: Telegram pitch, then the call. Strictly one at a time, earliest slot first.
  const queue = await db.fleetTarget.findMany({ where: { runId }, orderBy: [{ scheduledFor: "asc" }, { priority: "asc" }] });
  for (const t of queue) {
    if (["DONE", "NO_ANSWER", "FAILED", "SKIPPED", "CANCELLED"].includes(t.callStatus)) continue;
    const merchant = await db.merchant.findUniqueOrThrow({ where: { id: t.merchantId } });
    const contact = contacts.find((c) => c.priority === t.priority);
    if (t.scheduledFor && t.scheduledFor.getTime() > liveNow().getTime()) {
      await step(runId, `Waiting for ${merchant.name}'s best time: ${t.timingNote ?? t.bestTime}`);
      while (t.scheduledFor.getTime() > liveNow().getTime()) { await checkCancelled(runId); await new Promise((r) => setTimeout(r, 5000)); }
    }
    await checkCancelled(runId);
    let dealId = t.dealId;
    if (t.telegramStatus !== "SENT") {
      await step(runId, `Sending ${merchant.name} a pitch on Telegram`);
      try {
        dealId = await sendPitch(t.leadId!, t.pitch ?? "", true, { chatId: contact?.telegramChatId ?? null, phone: contact?.phone ?? null });
        const sent = await db.vyaparMessage.findFirst({ where: { dealId, direction: "out", metaJson: { contains: '"telegram":true' } } });
        await db.fleetTarget.update({ where: { id: t.id }, data: { dealId, telegramStatus: sent ? "SENT" : "NOT_SENT" } });
      } catch (error) {
        await db.fleetTarget.update({ where: { id: t.id }, data: { telegramStatus: "FAILED", callStatus: "SKIPPED", result: error instanceof Error ? error.message : "Couldn't send" } });
        continue;
      }
    }
    await checkCancelled(runId);
    await step(runId, `Calling priority ${t.priority}: ${merchant.name}`);
    const live = run.callMode === "live" && Boolean(contact?.phone);
    await db.fleetTarget.update({ where: { id: t.id }, data: { callStatus: "CALLING" } });
    try {
      const attemptId = t.attemptId ?? (await startAgentCall(dealId!, live ? { provider: "sarvam" } : { provider: "simulated", scenario: t.priority === 1 ? "sample" : "objection" })).attemptId;
      await db.fleetTarget.update({ where: { id: t.id }, data: { attemptId } });
      if (live) await waitForCall(attemptId);
      await recordOutcome(t.id, live);
    } catch (error) {
      await db.fleetTarget.update({ where: { id: t.id }, data: { callStatus: "FAILED", result: `Call couldn't start: ${error instanceof Error ? error.message.slice(0, 160) : "error"}` } });
    }
  }

  await checkCancelled(runId);
  await step(runId, "Writing your report");
  const report = await writeReport(runId);
  await db.fleetRun.update({ where: { id: runId }, data: { status: "DONE", step: "Done", report, finishedAt: liveNow() } });
  const final = await db.fleetTarget.findMany({ where: { runId }, orderBy: { priority: "asc" } });
  const names = await db.merchant.findMany({ where: { id: { in: final.map((t) => t.merchantId) } } });
  remember([{ id: `fleet-${runId}`, runId, title: "AI sales team run", text: `AI sales team run on ${liveNow().toLocaleDateString("en-IN")}. Goal: ${run.goal}. Timing: ${run.timing}. ${final.map((t) => `${names.find((m) => m.id === t.merchantId)?.name}: ${t.result ?? "no result"} (picked because: ${t.why}; contacted ${t.timingNote ?? "now"}).`).join(" ")} Summary: ${report}` }]);
}

async function waitForCall(attemptId: string) {
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    const r = await pollAgentCall(attemptId);
    if (r.status !== "dialing") return r.status;
    await new Promise((res) => setTimeout(res, 5000));
  }
  return "timeout";
}

/** Turns what the call produced (stage, objection, timing) into one plain sentence for the merchant. */
async function recordOutcome(targetId: string, live: boolean) {
  const t = await db.fleetTarget.findUniqueOrThrow({ where: { id: targetId } });
  const action = t.attemptId ? await db.vyaparAction.findFirst({ where: { type: "AI_CALL", ref: t.attemptId } }) : null;
  const deal = await db.vyaparDeal.findUniqueOrThrow({ where: { id: t.dealId! }, include: { merchant: true, memories: { orderBy: { createdAt: "desc" }, take: 3 } } });
  const first = deal.merchant.ownerName.trim().split(/\s+/)[0] || "The owner";
  const objection = deal.memories.find((m) => m.kind === "OBJECTION");
  const timing = deal.memories.find((m) => m.kind === "TIMING");
  let outcome = "unknown";
  let result: string;
  if (action?.status === "dialing") { outcome = "pending"; result = "Call still in progress; the result will appear in the chat."; }
  else if (action && ["no_answer", "busy", "failed"].includes(action.status)) { outcome = action.status; result = `${first} didn't pick up (${action.status.replace("_", " ")}). Try again ${t.bestTime ?? "later"}.`; }
  else if (deal.stage === "SAMPLE_REQUESTED") { outcome = "sample_requested"; result = `${first} agreed to a free sample${timing ? ` (${timing.summary.replace(/^Sample delivery: /, "delivery ")})` : ""}.`; }
  else if (deal.stage === "OBJECTION") { outcome = "objection"; result = `${first} isn't convinced yet${objection?.quote ? `: "${objection.quote}"` : ""}. Next: answer with the bulk price.`; }
  else if (deal.stage === "LOST") { outcome = "not_interested"; result = `${first} is not interested right now. We won't push.`; }
  else if (timing) { outcome = "callback"; result = `${first} asked us to call back (${timing.summary.replace(/^Call back: /, "")}).`; }
  else { outcome = "interested"; result = `${first} was positive; follow up on Telegram.`; }
  await db.fleetTarget.update({ where: { id: targetId }, data: { callStatus: outcome === "pending" ? "CALLING" : outcome === "no_answer" || outcome === "busy" ? "NO_ANSWER" : "DONE", outcome, result: `${result}${live ? "" : " (simulated call)"}` } });
}

async function writeReport(runId: string) {
  const targets = await db.fleetTarget.findMany({ where: { runId }, orderBy: { priority: "asc" } });
  const merchants = await db.merchant.findMany({ where: { id: { in: targets.map((t) => t.merchantId) } } });
  const lines = targets.map((t) => `${merchants.find((m) => m.id === t.merchantId)?.name}: ${t.result ?? "not contacted"}`);
  const samples = targets.filter((t) => t.outcome === "sample_requested").length;
  const fallback = `Your AI team contacted ${targets.length} business${targets.length === 1 ? "" : "es"} today: ${targets.filter((t) => t.telegramStatus === "SENT").length} got a Telegram pitch and ${targets.filter((t) => t.callStatus === "DONE").length} spoke on the phone. ${samples ? `${samples} agreed to a free sample. ` : ""}${lines.join(" ")}`;
  try {
    const { data } = await callStructured({ tier: "fast", schema: z.object({ report: z.string().max(600) }), schemaName: "VyaparFleetReport", system: "Write a short, friendly report (3–5 sentences, plain English, no jargon) for a shop owner about what their AI sales team did today and what happens next. Use only the facts given.", user: lines.join("\n") });
    return data.report;
  } catch {
    return fallback;
  }
}

export async function getFleetRun(id?: string) {
  const run = id ? await db.fleetRun.findUnique({ where: { id }, include: { targets: { orderBy: { priority: "asc" } } } }) : await db.fleetRun.findFirst({ orderBy: { createdAt: "desc" }, include: { targets: { orderBy: { priority: "asc" } } } });
  if (!run) return null;
  const merchants = await db.merchant.findMany({ where: { id: { in: run.targets.map((t) => t.merchantId) } } });
  // Never send another shop's hourly payment pattern to the client.
  return { ...run, targets: run.targets.map(({ hoursJson: _hours, ...t }) => ({ ...t, merchant: merchants.find((m) => m.id === t.merchantId)! })) };
}
