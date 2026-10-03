// Sarvam "Vyapar SDR" calls from the terminal (same services as the UI). Adapted from the teammate's scripts/vyapar/call.ts.
//   npm run vyapar:call -- <dealId|leadId|merchantId>                          preview only (default, never dials)
//   npm run vyapar:call -- <id> --simulated [--scenario sample|objection|callback|no_answer]
//   npm run vyapar:call -- <id> --live [--wait]                               one real call to DEMO_KARAN_PHONE
//   npm run vyapar:call -- <attemptId> --poll                                 wait for a call's result via Analytics
try { process.loadEnvFile(".env"); } catch { /* shell env is enough */ }

async function main() {
  const { db } = await import("../src/lib/db");
  const c = await import("../src/lib/vyapar/server/conversation");
  const args = process.argv.slice(2);
  const target = args.shift();
  const flag = (f: string) => args.includes(f);
  const scenario = (args[args.indexOf("--scenario") + 1] ?? "sample") as "sample" | "objection" | "callback" | "no_answer";
  if (!target) throw new Error("Usage: npm run vyapar:call -- <dealId|leadId|merchantId> [--simulated [--scenario x] | --live [--wait]] | <attemptId> --poll");
  if (flag("--poll")) return wait(c, target);
  const deal = await db.vyaparDeal.findUnique({ where: { id: target } });
  const lead = deal ? null : await db.vyaparLead.findUnique({ where: { id: target } }) ?? await db.vyaparLead.findFirst({ where: { merchantId: target, status: { not: "EXCLUDED" } }, orderBy: { createdAt: "desc" } });
  const openDeal = deal ?? (lead ? null : await db.vyaparDeal.findFirst({ where: { merchantId: target, stage: { notIn: ["LOST", "ORDER_WON"] } } }));
  if (!deal && !lead && !openDeal) throw new Error("No deal or lead found. Run a hunt in the app first, or pass a dealId.");
  if (!flag("--live") && !flag("--simulated")) {
    const id = deal?.id ?? openDeal?.id;
    console.log(JSON.stringify(id ? await c.previewAgentCall(id) : { note: "Lead has no deal yet; a deal is opened when the call starts.", leadId: lead!.id }, null, 2));
    return;
  }
  const dealId = deal?.id ?? openDeal?.id ?? await c.ensureDealForLead(lead!.id);
  const started = await c.startAgentCall(dealId, { provider: flag("--live") ? "sarvam" : "simulated", scenario });
  console.log(JSON.stringify({ dealId, ...started }, null, 2));
  if (flag("--live") && flag("--wait")) await wait(c, started.attemptId);
  await db.$disconnect();
}

async function wait(c: typeof import("../src/lib/vyapar/server/conversation"), attemptId: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const r = await c.pollAgentCall(attemptId);
    if (r.status !== "dialing") { console.log(JSON.stringify(r, null, 2)); return; }
    console.log("Waiting for the call result…");
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.log("Timed out after 180 s. The webhook may still deliver it later.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
export {};
