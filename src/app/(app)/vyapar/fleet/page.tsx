import Link from "next/link";
import { ChevronRight, Settings2 } from "lucide-react";
import { AppBar } from "@/components/paytm/ui";
import { HomeNav, VyaparTabs } from "@/components/paytm/nav";
import { FleetConsole } from "@/components/vyapar/fleet-console";
import { ensureWorker, getDemoContacts, getFleetRun, recentRuns } from "@/lib/vyapar/server/fleet";
import { getSeller } from "@/lib/vyapar/server/context";
import { sarvamConfigFor } from "@/lib/providers/sarvam-agent";
import { VoiceSetting } from "@/components/vyapar/voice-setting";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = { RUNNING: { label: "Working", cls: "b-cyan" }, DONE: { label: "Done", cls: "b-green" }, CANCELLED: { label: "Stopped", cls: "b-grey" }, FAILED: { label: "Failed", cls: "b-red" } };

/** AI team = where outreach started from Find is carried out and reported: live progress, results, past runs. */
export default async function FleetPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run: runId } = await searchParams;
  const [run, contacts, runs, seller] = await Promise.all([getFleetRun(runId), getDemoContacts(), recentRuns(), getSeller()]);
  let callVoiceMatches = seller.persona.gender === "female";
  try { callVoiceMatches = sarvamConfigFor(seller.persona.gender).voiceMatches; } catch { /* live calls not configured */ }
  if (run) ensureWorker(run);
  const past = runs.filter((r) => r.id !== run?.id);
  return <div className="page">
    <AppBar title="AI sales team" sub="Messages and calls the shops you picked in Find" />
    <VyaparTabs />
    <main className="scroll"><div className="pad">
      <FleetConsole key={run?.id ?? "none"} initialRun={run ? JSON.parse(JSON.stringify(run)) : null} contacts={contacts.map((c) => ({ priority: c.priority, phone: c.phone, telegramChatId: c.telegramChatId }))} />
      {past.length > 0 && <div className="card">
        <div className="card-title" style={{ marginBottom: 4 }}>Earlier outreach</div>
        {past.map((r) => <Link key={r.id} href={`/vyapar/fleet?run=${r.id}`} className="list-row">
          <div className="grow" style={{ minWidth: 0 }}><b style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.goal}</b><small>{r.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {r.shops} shop{r.shops === 1 ? "" : "s"}{r.samples ? ` · ${r.samples} sample${r.samples === 1 ? "" : "s"}` : ""}</small></div>
          <span className={`badge ${STATUS[r.status]?.cls ?? "b-grey"}`}>{STATUS[r.status]?.label ?? r.status}</span><ChevronRight size={16} />
        </Link>)}
      </div>}
      <VoiceSetting initial={{ gender: seller.ownerGender, persona: { name: seller.persona.agentName, speaker: seller.persona.speaker }, callVoiceMatches }} sellerFirst={seller.ownerFirstName} />
      <Link href="/vyapar/onboarding" className="card row" style={{ gap: 10 }}>
        <Settings2 size={18} color="var(--pt-muted)" />
        <div className="grow"><b style={{ fontSize: 13 }}>Business brief</b><div className="xs muted">What the team says about your products and offers</div></div>
        <ChevronRight size={18} />
      </Link>
    </div></main>
    <HomeNav />
  </div>;
}
