"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LoaderCircle, Phone, Play, Send, SlidersHorizontal, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";

type Candidate = { id: string; name: string; category: string; distanceKm: number };
const TIMINGS = [
  { id: "quiet", label: "Quietest hour", short: "at their quietest hour", detail: "When the shop gets the fewest Paytm payments while open, so the owner is free to talk" },
  { id: "after_open", label: "Just after opening", short: "just after they open", detail: "First hour after their usual first payment, before the rush" },
  { id: "now", label: "Right now", short: "right now", detail: "Contact immediately (for live demos)" },
] as const;
type Timing = (typeof TIMINGS)[number]["id"];

/** Search results → one tap: the AI team messages, then calls, the top shops at each shop's best time. */
export function OutreachBar({ huntId, candidates }: { huntId: string; candidates: Candidate[] }) {
  const [count, setCount] = useState(Math.min(3, candidates.length));
  const [timing, setTiming] = useState<Timing>("quiet");
  const [mode, setMode] = useState<"live" | "simulated">("live");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (!candidates.length) return null;
  const chosen = candidates.slice(0, count);
  const t = TIMINGS.find((x) => x.id === timing)!;

  async function start() {
    setBusy(true);
    const res = await fetch("/api/vyapar/fleet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ huntId, leadIds: chosen.map((c) => c.id), timing, callMode: mode }) }).then((r) => r.json()).catch(() => null);
    if (!res?.ok) { setBusy(false); return toast(res?.error?.message ?? "Couldn't start outreach"); }
    toast(res.data.alreadyRunning ? "Your AI team is still busy with the last outreach. Stop it first to start a new one" : "Your AI team is on it");
    router.push(`/vyapar/fleet?run=${res.data.runId}`);
  }

  return <>
    <div className="outreach-bar">
      <div className="grow" style={{ minWidth: 0 }}>
        <b>Message &amp; call top {count}</b>
        <small><Clock size={11} /> {t.short} · {mode === "live" ? "real calls" : "simulated calls"}</small>
      </div>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Change outreach plan"><SlidersHorizontal size={18} /></button>
      <button className="btn btn-primary btn-sm" onClick={start} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Play />}Start</button>
    </div>
    {open && <div className="sheet-backdrop" onClick={() => setOpen(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Outreach plan">
        <div className="row"><b className="grow">Outreach plan</b><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button></div>
        <p className="xs muted">Your AI team sends each shop a personal Telegram pitch with a voice note, then calls them one at a time, in this order. You can stop it any time.</p>
        <div className="sec-label">How many shops</div>
        <div className="seg-mini" style={{ justifySelf: "start" }}>{candidates.map((_, i) => <button key={i} className={count === i + 1 ? "on" : ""} onClick={() => setCount(i + 1)}>{i + 1}</button>)}</div>
        <ol className="plan-list">{chosen.map((c) => <li key={c.id}><b>{c.name}</b><span className="xs muted">{c.category} · {c.distanceKm} km</span></li>)}</ol>
        <div className="sec-label">When</div>
        <div className="timing-opts" role="radiogroup" aria-label="When to contact">
          {TIMINGS.map((x) => <button key={x.id} role="radio" aria-checked={timing === x.id} className={`timing-opt${timing === x.id ? " on" : ""}`} onClick={() => setTiming(x.id)}><b>{x.label}{x.id === "quiet" ? " (recommended)" : ""}</b><span>{x.detail}</span></button>)}
        </div>
        <div className="sec-label">Calls</div>
        <div className="seg-mini" style={{ justifySelf: "start" }}><button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}><Phone size={12} /> Real (demo phone)</button><button className={mode === "simulated" ? "on" : ""} onClick={() => setMode("simulated")}>Simulated</button></div>
        <button className="btn btn-primary btn-block" onClick={start} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Send />}Start outreach to {count} shop{count === 1 ? "" : "s"}</button>
      </div>
    </div>}
  </>;
}
