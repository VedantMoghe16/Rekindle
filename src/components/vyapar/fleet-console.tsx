"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Check, CircleDashed, LoaderCircle, MessageCircle, Phone, Play, Save, Send, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";

type Target = { id: string; priority: number; why: string; bestTime: string | null; pitch: string | null; telegramStatus: string; callStatus: string; outcome: string | null; result: string | null; dealId: string | null; merchant: { name: string; category: string; area: string; ownerName: string } };
type Run = { id: string; status: string; step: string; goal: string; callMode: string; report: string | null; error: string | null; createdAt: string; finishedAt: string | null; targets: Target[] };
type Contact = { priority: number; phone: string | null; telegramChatId: string | null };

const STEPS = ["Finding businesses near you", "Ranking the best", "Writing a personal pitch", "Sending pitches on Telegram", "Calling priority 1", "Calling priority 2", "Writing your report"];
const stepIndex = (step: string, status: string) => (status === "DONE" ? STEPS.length : Math.max(0, STEPS.findIndex((s) => step.startsWith(s.split(":")[0]))));
const CALL_BADGE: Record<string, string> = { QUEUED: "b-grey", CALLING: "b-cyan", DONE: "b-green", NO_ANSWER: "b-amber", FAILED: "b-red", SKIPPED: "b-grey" };
const CALL_LABEL: Record<string, string> = { QUEUED: "Call queued", CALLING: "On the call…", DONE: "Called", NO_ANSWER: "No answer", FAILED: "Call failed", SKIPPED: "Not called" };

export function FleetConsole({ initialRun, contacts: initialContacts, briefed }: { initialRun: Run | null; contacts: Contact[]; briefed: boolean }) {
  const [run, setRun] = useState<Run | null>(initialRun);
  const [mode, setMode] = useState<"live" | "simulated">("live");
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>(initialContacts.length ? initialContacts : [{ priority: 1, phone: "", telegramChatId: "" }, { priority: 2, phone: "", telegramChatId: "" }]);
  const router = useRouter();

  useEffect(() => {
    if (!run || run.status !== "RUNNING") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/vyapar/fleet/${run.id}`).then((r) => r.json()).catch(() => null);
      if (res?.ok) { setRun(res.data); if (res.data.status !== "RUNNING") { clearInterval(t); router.refresh(); } }
    }, 3000);
    return () => clearInterval(t);
  }, [run?.id, run?.status, router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setBusy(true);
    const res = await fetch("/api/vyapar/fleet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callMode: mode }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast("Couldn't start the AI team");
    const r = await fetch(`/api/vyapar/fleet/${res.data.runId}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setRun(r.data);
    toast("Your AI sales team is on it");
  }
  async function saveContacts() {
    const res = await fetch("/api/vyapar/fleet/contacts", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ contacts: contacts.map((c) => ({ priority: c.priority, phone: c.phone?.trim() || null, telegramChatId: c.telegramChatId?.trim() || null })) }) }).then((r) => r.json()).catch(() => null);
    toast(res?.ok ? "Demo contacts saved" : res?.error?.message ?? "Couldn't save");
  }
  const idx = run ? stepIndex(run.step, run.status) : -1;
  const running = run?.status === "RUNNING";

  return <>
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row"><Bot size={20} color="var(--pt-cyan-600)" /><b className="grow" style={{ color: "var(--pt-navy)", fontSize: 15 }}>Your AI sales team</b></div>
      <span className="small">One tap: it finds the best shops for you, sends each a personal pitch on Telegram, then calls them <b>one by one</b> (priority 1 first) and reports back here.</span>
      {!briefed && <Link href="/vyapar/onboarding" className="badge b-amber" style={{ justifySelf: "start" }}>Tip: tell the team about your business first →</Link>}
      <div className="seg-mini" style={{ justifySelf: "start" }}><button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>Real calls</button><button className={mode === "simulated" ? "on" : ""} onClick={() => setMode("simulated")}>Simulated calls</button></div>
      <button className="btn btn-primary btn-block" onClick={start} disabled={busy || running}>{busy || running ? <LoaderCircle className="spin" /> : <Play />}{running ? "Working…" : "Run AI sales team"}</button>
    </div>

    {run && <div className="card stack" style={{ gap: 8 }}>
      <div className="card-title">{running ? "Working on it" : run.status === "FAILED" ? "Stopped" : "Last run"} <span className="xs muted">{new Date(run.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {run.callMode === "live" ? "real calls" : "simulated calls"}</span></div>
      <div className="steps" style={{ marginTop: 0 }}>{STEPS.map((s, i) => <div key={s} className={`step${i < idx ? " done" : i === idx && running ? " run" : ""}`}><span className="st">{i < idx && <Check />}</span>{i === idx && running ? run.step : s}</div>)}</div>
      {run.error && <div className="badge b-red" style={{ whiteSpace: "normal" }}>{run.error}</div>}
    </div>}

    {run?.report && <div className="report-card rise"><b>Today&apos;s report</b><p>{run.report}</p></div>}

    {run?.targets.map((t) => <article key={t.id} className="opp">
      <div className="row"><span className="prio">#{t.priority}</span><div className="grow"><b>{t.merchant.name}</b><div className="xs muted">{t.merchant.category} · {t.merchant.area} · best time {t.bestTime ?? "—"}</div></div></div>
      <div className="small"><span className="muted">Why first: </span>{t.why}</div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className={`badge ${t.telegramStatus === "SENT" ? "b-green" : t.telegramStatus === "PENDING" ? "b-grey" : "b-red"}`}>{t.telegramStatus === "SENT" ? <Send /> : <CircleDashed />}Telegram {t.telegramStatus === "SENT" ? "sent" : t.telegramStatus.toLowerCase().replace("_", " ")}</span>
        <span className={`badge ${CALL_BADGE[t.callStatus] ?? "b-grey"}`}>{t.callStatus === "CALLING" ? <LoaderCircle className="spin" /> : t.callStatus === "FAILED" ? <X /> : <Phone />}{CALL_LABEL[t.callStatus] ?? t.callStatus}</span>
      </div>
      {t.result && <div className={`result-line ${t.outcome ?? ""}`}>{t.result}</div>}
      {t.dealId && <Link className="btn btn-ghost btn-sm" href={`/vyapar/deals/${t.dealId}`}><MessageCircle />Open conversation &amp; transcript</Link>}
    </article>)}

    <details className="card">
      <summary className="card-title" style={{ cursor: "pointer" }}>Demo contacts (who stands in for priority 1 &amp; 2)</summary>
      <p className="xs muted" style={{ margin: "6px 0 10px" }}>The demo shops are fictional, so their Telegram messages and calls go to these real contacts.</p>
      {contacts.map((c, i) => <div key={c.priority} className="contact-row">
        <b>#{c.priority}</b>
        <input placeholder="Phone, e.g. +9197…" value={c.phone ?? ""} onChange={(e) => setContacts((all) => all.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
        <input placeholder="Telegram chat id" value={c.telegramChatId ?? ""} onChange={(e) => setContacts((all) => all.map((x, j) => (j === i ? { ...x, telegramChatId: e.target.value } : x)))} />
      </div>)}
      <button className="btn btn-ghost btn-sm" onClick={saveContacts}><Save />Save contacts</button>
    </details>
  </>;
}
