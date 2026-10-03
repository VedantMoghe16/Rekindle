"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Clock, LoaderCircle, Mic, PencilLine, RefreshCw, Send, ShieldCheck, ShieldOff, Sparkles, TrendingUp, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";

type CheckRow = { id: string; label: string; ok: boolean; detail: string };
type Item = { channel: string; why: { template: string; channel: string } | null; id: string; dealId: string; cohortLabel: string; attempt: number; reason: string; text: string; status: string; risk: string; provider: string; timingNote: string | null; scheduledFor: string; autoApproved: boolean; note: string | null; repliedAt: string | null; sentAt: string | null; silentDays: number; checks: CheckRow[]; merchant: { id: string; name: string; category: string } | null };
type Queue = { settings: { mode: string }; waiting: Item[]; scheduled: Item[]; history: Item[]; held: { dealId: string; name: string; why: string }[]; stats: { sent: number; replied: number; templates: { id: string; label: string; rate: number; sent: number; replied: number }[] } };

const MODES = [
  { id: "review", label: "I approve each", detail: "Every follow-up waits for your OK" },
  { id: "auto", label: "Auto-send safe ones", detail: "Low-risk ones go at the quietest hour; price changes and lost deals still wait for you" },
  { id: "off", label: "Off", detail: "No follow-ups" },
] as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" });

function FollowupCard({ f, onDone }: { f: Item; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(f.text);
  const [busy, setBusy] = useState<string | null>(null);
  const [showChecks, setShowChecks] = useState(false);
  const passed = f.checks.filter((c) => c.ok).length;
  async function act(action: "approve" | "skip", sendNow = false) {
    setBusy(sendNow ? "now" : action);
    const res = await fetch(`/api/vyapar/followups/${f.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, text: editing ? text : undefined, sendNow }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (!res?.ok) return toast(res?.error?.message ?? "Couldn't do that");
    toast(action === "skip" ? "Skipped" : sendNow ? "Sent on Telegram" : `Approved: goes ${f.timingNote?.split(":")[0].toLowerCase() ?? "at the quietest hour"}`);
    onDone();
  }
  return <article className="fu-card">
    <div className="row" style={{ gap: 8 }}>
      <div className="grow" style={{ minWidth: 0 }}>{f.merchant ? <Link href={`/vyapar/deals/${f.dealId}`}><b>{f.merchant.name}</b></Link> : <b>Deal</b>}<div className="xs muted">{f.merchant?.category} · quiet {f.silentDays} days · follow-up {f.attempt} of 3</div></div>
      <span className={`badge ${f.risk === "review" ? "b-amber" : "b-cyan"}`}>{f.cohortLabel}</span>
    </div>
    {f.channel === "voice" && <span className="badge b-navy" style={{ justifySelf: "start" }}><Mic />Sends as a voice note</span>}
    <div className="fu-why"><b>Why now:</b> {f.reason}</div>
    {editing ? <textarea className="draft-edit" value={text} onChange={(e) => setText(e.target.value)} aria-label="Follow-up message" /> : <div className="fu-msg">{text}</div>}
    {f.why && <div className="fu-ai"><Sparkles size={12} /><span>{f.why.template}.{f.channel === "voice" ? ` ${f.why.channel}.` : ""}</span></div>}
    <div className="row xs muted" style={{ gap: 6, flexWrap: "wrap" }}>
      <span className="row" style={{ gap: 4 }}><Clock size={12} />{f.timingNote ?? when(f.scheduledFor)}</span>
      <span>· {f.provider === "template" ? "Template" : f.provider === "human" ? "Edited by you" : "Template, personalised by Gemini"}</span>
    </div>
    <button className="fu-checks-toggle" onClick={() => setShowChecks((s) => !s)}><ShieldCheck size={14} />{passed}/{f.checks.length} safety checks passed<ChevronDown size={14} style={{ transform: showChecks ? "rotate(180deg)" : undefined }} /></button>
    {showChecks && <div className="fu-checks">{f.checks.map((c) => <div key={c.id} className={c.ok ? "ok" : "bad"}>{c.ok ? <Check size={12} /> : <X size={12} />}<b>{c.label}</b><span>{c.detail}</span></div>)}</div>}
    {f.risk === "review" && <div className="xs" style={{ color: "#b54708" }}>Needs your OK: {f.cohortLabel === "Lost deal" ? "this revives a lost deal" : "it mentions a price change"}.</div>}
    <div className="row" style={{ gap: 6 }}>
      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => act("skip")} disabled={busy !== null} aria-label="Skip">{busy === "skip" ? <LoaderCircle className="spin" /> : <X />}</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setEditing((e) => !e)} disabled={busy !== null}><PencilLine />{editing ? "Done" : "Edit"}</button>
      <button className="btn btn-ghost btn-sm grow" onClick={() => act("approve", true)} disabled={busy !== null}>{busy === "now" ? <LoaderCircle className="spin" /> : <Send />}Send now</button>
      <button className="btn btn-primary btn-sm grow" onClick={() => act("approve")} disabled={busy !== null}>{busy === "approve" ? <LoaderCircle className="spin" /> : <Check />}Approve</button>
    </div>
  </article>;
}

/** Follow-up agent: drafts follow-ups for silent leads under guardrails; you approve, or let safe ones auto-send. */
export function FollowupQueue({ initial }: { initial: Queue }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function refresh() {
    const res = await fetch("/api/vyapar/followups").then((r) => r.json()).catch(() => null);
    if (res?.ok) setQ(res.data);
    router.refresh();
  }
  async function post(body: Record<string, unknown>, msg: (n: number) => string) {
    setBusy(true);
    const res = await fetch("/api/vyapar/followups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast(res?.error?.message ?? "Couldn't do that");
    setQ(res.data.queue);
    toast(msg(res.data.planned));
  }
  const mode = q.settings.mode;
  return <>
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row"><RefreshCw size={18} color="var(--pt-cyan-600)" /><b className="grow" style={{ color: "var(--pt-navy)", fontSize: 15 }}>Follow-up agent</b><button className="btn btn-ghost btn-sm" onClick={() => post({ action: "scan" }, (n) => (n ? `${n} new follow-up${n === 1 ? "" : "s"} drafted` : "Nothing new: everyone is either active or protected by a guardrail"))} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <RefreshCw />}Check now</button></div>
      <span className="small">Finds leads that went quiet for 4+ days, writes a short follow-up with a <b>new reason</b> to reply, and sends it on Telegram at the shop&apos;s quietest hour.</span>
      <div className="timing-opts" role="radiogroup" aria-label="How much the agent may do">
        {MODES.map((m) => <button key={m.id} role="radio" aria-checked={mode === m.id} className={`timing-opt${mode === m.id ? " on" : ""}`} onClick={() => post({ action: "settings", mode: m.id }, () => `Follow-ups: ${m.label.toLowerCase()}`)} disabled={busy}><b>{m.label}</b><span>{m.detail}</span></button>)}
      </div>
      <details className="fu-rules"><summary><ShieldCheck size={14} />Guardrails, always on</summary>
        <ul>
          <li>Never messages anyone who said stop or &ldquo;message mat bhejo&rdquo;</li>
          <li>Only after 4+ quiet days, at most 3 unanswered follow-ups, 4+ days apart</li>
          <li>Never while the buyer is waiting on <i>your</i> reply</li>
          <li>Every message needs a new reason (no &ldquo;just checking in&rdquo;)</li>
          <li>Lost deals only after 14 days (30 if not interested), and only with something new</li>
          <li>If they said &ldquo;after Diwali&rdquo; or &ldquo;next week&rdquo;, it waits for that date, then follows up on it</li>
          <li>Real prices from your offer sheet only; no private Paytm data; no pressure words</li>
          <li>Queued follow-ups are cancelled the moment the buyer replies</li>
        </ul>
      </details>
      <div className="row xs muted" style={{ gap: 10 }}><span><b style={{ color: "var(--pt-navy)" }}>{q.stats.sent}</b> sent</span><span><b style={{ color: "var(--pt-green)" }}>{q.stats.replied}</b> got a reply</span></div>
    </div>

    <div className="sec-title">Waiting for you ({q.waiting.length})</div>
    {q.waiting.length === 0 && <div className="empty small">Nothing to approve. Tap <b>Check now</b> to look for quiet leads.</div>}
    {q.waiting.map((f) => <FollowupCard key={f.id} f={f} onDone={refresh} />)}

    {q.scheduled.length > 0 && <>
      <div className="sec-title">Scheduled ({q.scheduled.length})</div>
      {q.scheduled.map((f) => <div key={f.id} className="card row" style={{ gap: 8 }}>
        <Clock size={16} color="var(--pt-cyan-600)" />
        <div className="grow" style={{ minWidth: 0 }}><b style={{ fontSize: 13 }}>{f.merchant?.name}</b><div className="xs muted">{f.timingNote ?? when(f.scheduledFor)}{f.autoApproved ? " · auto (low risk)" : " · approved by you"}</div></div>
        <button className="btn btn-ghost btn-sm" onClick={async () => { await fetch(`/api/vyapar/followups/${f.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "skip" }) }); toast("Cancelled"); refresh(); }}>Cancel</button>
      </div>)}
    </>}

    {q.held.length > 0 && <>
      <div className="sec-title">Not messaging, on purpose ({q.held.length})</div>
      <div className="card">{q.held.map((h) => <Link key={h.dealId} href={`/vyapar/deals/${h.dealId}`} className="list-row"><ShieldOff size={16} color="var(--pt-muted)" /><div className="grow"><b style={{ fontSize: 13 }}>{h.name}</b><small>{h.why}</small></div></Link>)}</div>
    </>}

    <details className="card">
      <summary className="card-title" style={{ cursor: "pointer" }}><span className="row" style={{ gap: 6 }}><TrendingUp size={16} />What works</span><span className="xs muted">reply rate</span></summary>
      <p className="xs muted" style={{ margin: "6px 0 8px" }}>The agent picks the message style with the best reply rate. It starts from a demo benchmark and learns from your own results.</p>
      {q.stats.templates.map((t) => <div key={t.id} className="fu-rate"><span className="grow">{t.label}{t.sent ? <small> · yours {t.replied}/{t.sent}</small> : null}</span><i style={{ width: `${t.rate * 1.6}px` }} /><b>{t.rate}%</b></div>)}
    </details>

    {q.history.length > 0 && <>
      <div className="sec-title">Recent</div>
      <div className="card">{q.history.map((f) => <Link key={f.id} href={`/vyapar/deals/${f.dealId}`} className="list-row">
        <div className="grow" style={{ minWidth: 0 }}><b style={{ fontSize: 13 }}>{f.merchant?.name}</b><small style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.status === "SENT" ? f.text : f.note}</small></div>
        <span className={`badge ${f.repliedAt ? "b-green" : f.status === "SENT" ? "b-cyan" : "b-grey"}`}>{f.repliedAt ? "Replied" : f.status === "SENT" ? (f.autoApproved ? "Auto-sent" : "Sent") : f.status === "SKIPPED" ? "Skipped" : "Cancelled"}</span>
      </Link>)}</div>
    </>}
  </>;
}
