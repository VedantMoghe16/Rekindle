import { z } from "zod";
import { db } from "@/lib/db";
import { callStructured, LlmOfflineMiss } from "@/lib/providers/llm";
import { getSeller, liveNow, remember } from "@/lib/vyapar/server/context";
import { createHunt, getHunt } from "@/lib/vyapar/server/hunts";
import { getPitch, sendPitch } from "@/lib/vyapar/server/pitches";
import { pollAgentCall, startAgentCall } from "@/lib/vyapar/server/conversation";
import { getOnboarding } from "@/lib/vyapar/server/onboarding";
import type { HuntLead } from "@/lib/vyapar/server/opportunities";

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

export async function startFleet(opts: { callMode: "live" | "simulated" }) {
  const running = await db.fleetRun.findFirst({ where: { status: "RUNNING" }, orderBy: { createdAt: "desc" } });
  if (running) return running.id;
  const seller = await getSeller();
  const { brief } = await getOnboarding();
  const run = await db.fleetRun.create({ data: { sellerId: seller.id, goal: brief.huntPrompt, callMode: opts.callMode, createdAt: liveNow() } });
  void runFleet(run.id).catch(async (error) => {
    console.error("[vyapar] fleet run failed", error);
    await db.fleetRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), finishedAt: liveNow() } });
  });
  return run.id;
}

const step = (runId: string, text: string) => db.fleetRun.update({ where: { id: runId }, data: { step: text } });

async function runFleet(runId: string) {
  const run = await db.fleetRun.findUniqueOrThrow({ where: { id: runId } });
  const { brief } = await getOnboarding();
  // Always run at least two targets (priority 1 then 2). A priority without a demo contact still gets a Telegram
  // pitch (to the default demo chat) and a simulated call, clearly labelled.
  const contacts = await getDemoContacts();
  const n = Math.max(2, Math.min(3, contacts.filter((c) => c.phone || c.telegramChatId).length));

  await step(runId, "Finding businesses near you");
  const huntId = await createHunt(run.goal);
  await db.fleetRun.update({ where: { id: runId }, data: { huntId } });
  const hunt = await getHunt(huntId);
  // New business only: skip anyone we already have a deal with (in talks, won or lost).
  const known = new Set((await db.vyaparDeal.findMany({ select: { merchantId: true } })).map((d) => d.merchantId));
  const reachable = (hunt?.shortlist ?? []).filter((l) => l.opp.action === "pitch" && !known.has(l.merchant.id)).slice(0, 8);
  if (!reachable.length) throw new Error("No reachable businesses found. Check the onboarding answers.");

  await step(runId, `Ranking the best ${n} of ${reachable.length} businesses to contact`);
  const picked = await rerank(reachable, brief, n);
  for (const [i, p] of picked.entries()) {
    await db.fleetTarget.create({ data: { runId, priority: i + 1, merchantId: p.lead.merchant.id, leadId: p.lead.id, why: p.why, bestTime: p.bestTime } });
  }
  const targets = await db.fleetTarget.findMany({ where: { runId }, orderBy: { priority: "asc" } });

  await step(runId, "Writing a personal pitch for each business");
  for (const t of targets) {
    const pitch = await getPitch(t.leadId!).catch(() => null);
    await db.fleetTarget.update({ where: { id: t.id }, data: { pitch: pitch?.pitch.text ?? null } });
  }

  await step(runId, "Sending pitches on Telegram");
  for (const t of await db.fleetTarget.findMany({ where: { runId }, orderBy: { priority: "asc" } })) {
    const contact = contacts[t.priority - 1];
    try {
      const dealId = await sendPitch(t.leadId!, t.pitch ?? "", true, { chatId: contact?.telegramChatId ?? null, phone: contact?.phone ?? null });
      const sent = await db.vyaparMessage.findFirst({ where: { dealId, direction: "out", metaJson: { contains: '"telegram":true' } } });
      await db.fleetTarget.update({ where: { id: t.id }, data: { dealId, telegramStatus: sent ? "SENT" : "NOT_SENT" } });
    } catch (error) {
      await db.fleetTarget.update({ where: { id: t.id }, data: { telegramStatus: "FAILED", result: error instanceof Error ? error.message : "Couldn't send" } });
    }
  }

  // Calls: one at a time, in priority order. Each waits for its result before the next one starts.
  for (const t of await db.fleetTarget.findMany({ where: { runId }, orderBy: { priority: "asc" } })) {
    if (!t.dealId) { await db.fleetTarget.update({ where: { id: t.id }, data: { callStatus: "SKIPPED" } }); continue; }
    const merchant = await db.merchant.findUniqueOrThrow({ where: { id: t.merchantId } });
    await step(runId, `Calling priority ${t.priority}: ${merchant.name}`);
    const contact = contacts[t.priority - 1];
    const live = run.callMode === "live" && Boolean(contact?.phone);
    await db.fleetTarget.update({ where: { id: t.id }, data: { callStatus: "CALLING" } });
    try {
      const started = await startAgentCall(t.dealId, live ? { provider: "sarvam" } : { provider: "simulated", scenario: t.priority === 1 ? "sample" : "objection" });
      await db.fleetTarget.update({ where: { id: t.id }, data: { attemptId: started.attemptId } });
      if (live) await waitForCall(started.attemptId);
      await recordOutcome(t.id, live);
    } catch (error) {
      await db.fleetTarget.update({ where: { id: t.id }, data: { callStatus: "FAILED", result: `Call couldn't start: ${error instanceof Error ? error.message.slice(0, 160) : "error"}` } });
    }
  }

  await step(runId, "Writing your report");
  const report = await writeReport(runId);
  await db.fleetRun.update({ where: { id: runId }, data: { status: "DONE", step: "Done", report, finishedAt: liveNow() } });
  const final = await db.fleetTarget.findMany({ where: { runId }, orderBy: { priority: "asc" } });
  const names = await db.merchant.findMany({ where: { id: { in: final.map((t) => t.merchantId) } } });
  remember([{ id: `fleet-${runId}`, runId, title: "AI sales team run", text: `AI sales team run on ${liveNow().toLocaleDateString("en-IN")}. Goal: ${run.goal}. ${final.map((t) => `${names.find((m) => m.id === t.merchantId)?.name}: ${t.result ?? "no result"} (picked because: ${t.why}).`).join(" ")} Summary: ${report}` }]);
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
  const first = deal.merchant.ownerName.split(" ")[0];
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
  return { ...run, targets: run.targets.map((t) => ({ ...t, merchant: merchants.find((m) => m.id === t.merchantId)! })) };
}
