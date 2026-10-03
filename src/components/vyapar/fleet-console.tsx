"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Check, CircleDashed, LoaderCircle, MessageCircle, Phone, Save, Search, Send, Square, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";

type Target = { id: string; priority: number; why: string; bestTime: string | null; timingNote: string | null; hoursJson: string | null; scheduledFor: string | null; pitch: string | null; telegramStatus: string; callStatus: string; outcome: string | null; result: string | null; dealId: string | null; merchant: { name: string; category: string; area: string; ownerName: string } };
type Run = { id: string; status: string; step: string; goal: string; callMode: string; timing: string; report: string | null; error: string | null; createdAt: string; finishedAt: string | null; targets: Target[] };
type Contact = { priority: number; phone: string | null; telegramChatId: string | null };

const STEPS = ["Picking up your shops", "Ranking who to contact first", "Writing a personal pitch for each", "Contacting each shop at its best time", "Writing your report"];
function stepIndex(step: string, status: string) {
  if (status === "DONE") return STEPS.length;
  if (/^(Finding|Picking)/.test(step)) return 0;
  if (/^Ranking/.test(step)) return 1;
  if (/^Writing a personal/.test(step)) return 2;
  if (/^(Waiting|Sending|Calling)/.test(step)) return 3;
  if (/^Writing your report/.test(step)) return 4;
  return 0;
}
const TIMINGS = [
  { id: "quiet", label: "Quietest hour", detail: "When they get the fewest Paytm payments while open, so the owner is free to talk" },
  { id: "after_open", label: "Just after opening", detail: "First hour after their usual first payment, before the rush" },
  { id: "now", label: "Right now", detail: "Contact immediately (best for live demos)" },
] as const;

function Hours({ json, chosen }: { json: string | null; chosen: string | null }) {
  if (!json) return null;
  const h: number[] = JSON.parse(json);
  const max = Math.max(...h, 1);
  const pick = chosen && chosen !== "now" ? (() => { const m = chosen.match(/(\d+) (AM|PM)/); if (!m) return -1; const n = Number(m[1]) % 12; return m[2] === "PM" ? n + 12 : n; })() : -1;
  return <div className="hours-wrap" aria-label="Paytm payments by hour of day (demo data)">
    <div className="hours">{h.map((v, i) => <i key={i} title={`${i}:00 · ${v} payments`} className={i === pick ? "pick" : v >= 1 ? "open" : ""} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />)}</div>
    <span className="xs muted">Paytm payments by hour of day, midnight → 11 PM (demo data) · <b style={{ color: "var(--pt-green)" }}>■</b> chosen time</span>
  </div>;
}
const CALL_BADGE: Record<string, string> = { SCHEDULED: "b-navy", CANCELLED: "b-grey", QUEUED: "b-grey", CALLING: "b-cyan", DONE: "b-green", NO_ANSWER: "b-amber", FAILED: "b-red", SKIPPED: "b-grey" };
const CALL_LABEL: Record<string, string> = { SCHEDULED: "Call scheduled", CANCELLED: "Cancelled", QUEUED: "Call queued", CALLING: "On the call…", DONE: "Called", NO_ANSWER: "No answer", FAILED: "Call failed", SKIPPED: "Not called" };

export function FleetConsole({ initialRun, contacts: initialContacts }: { initialRun: Run | null; contacts: Contact[] }) {
  const [run, setRun] = useState<Run | null>(initialRun);
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

  async function stop() {
    if (!run) return;
    const res = await fetch(`/api/vyapar/fleet/${run.id}/cancel`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    if (res?.ok) { const r = await fetch(`/api/vyapar/fleet/${run.id}`).then((x) => x.json()).catch(() => null); if (r?.ok) setRun(r.data); toast("Stopped. No more messages or calls will go out"); router.refresh(); }
    else toast("Couldn't stop the run");
  }
  async function saveContacts() {
    const res = await fetch("/api/vyapar/fleet/contacts", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ contacts: contacts.map((c) => ({ priority: c.priority, phone: c.phone?.trim() || null, telegramChatId: c.telegramChatId?.trim() || null })) }) }).then((r) => r.json()).catch(() => null);
    toast(res?.ok ? "Demo contacts saved" : res?.error?.message ?? "Couldn't save");
  }
  const idx = run ? stepIndex(run.step, run.status) : -1;
  const running = run?.status === "RUNNING";

  return <>
    {!run && <div className="card stack empty-team">
      <Bot size={28} color="var(--pt-cyan-600)" />
      <b>Your AI team is free</b>
      <span className="small muted">Tell Vyapar who to find, for example &ldquo;bakeries within 3 km&rdquo;, then tap <b>Start</b> on the results. The team messages and calls each shop at its quietest hour and reports here.</span>
      <Link className="btn btn-primary" href="/vyapar"><Search />Find shops</Link>
    </div>}
    {run && <div className="card stack" style={{ gap: 8 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}><div className="grow"><b style={{ color: "var(--pt-navy)" }}>{running ? "Working on it" : run.status === "CANCELLED" ? "Stopped by you" : run.status === "FAILED" ? "Stopped" : "Done"}</b><div className="small muted">&ldquo;{run.goal}&rdquo;</div></div>{running && <button className="btn btn-stop btn-sm" onClick={stop}><Square />Stop</button>}</div>
      <span className="xs muted">{new Date(run.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {run.callMode === "live" ? "real calls" : "simulated calls"} · {TIMINGS.find((t) => t.id === run.timing)?.label ?? "quietest hour"}</span>
      <div className="steps" style={{ marginTop: 0 }}>{STEPS.map((s, i) => <div key={s} className={`step${i < idx ? " done" : i === idx && running ? " run" : ""}`}><span className="st">{i < idx && <Check />}</span>{i === idx && running ? run.step : s}</div>)}</div>
      {running && <div className="now-step">{run.step}</div>}
      {run.error && <div className="badge b-red" style={{ whiteSpace: "normal" }}>{run.error}</div>}
    </div>}

    {run?.report && <div className="report-card rise"><b>Today&apos;s report</b><p>{run.report}</p></div>}

    {run?.targets.map((t) => <article key={t.id} className="opp">
      <div className="row"><span className="prio">#{t.priority}</span><div className="grow"><b>{t.merchant.name}</b><div className="xs muted">{t.merchant.category} · {t.merchant.area}</div></div></div>
      {t.timingNote && <div className="small"><span className="muted">When: </span>{t.timingNote}</div>}
      <Hours json={t.hoursJson} chosen={t.bestTime} />
      <div className="small"><span className="muted">Why first: </span>{t.why}</div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className={`badge ${t.telegramStatus === "SENT" ? "b-green" : ["PENDING", "SCHEDULED", "CANCELLED"].includes(t.telegramStatus) ? "b-grey" : "b-red"}`}>{t.telegramStatus === "SENT" ? <Send /> : <CircleDashed />}Telegram {t.telegramStatus === "SENT" ? "sent" : t.telegramStatus === "SCHEDULED" && t.scheduledFor ? `at ${new Date(t.scheduledFor).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}` : t.telegramStatus.toLowerCase().replace("_", " ")}</span>
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
