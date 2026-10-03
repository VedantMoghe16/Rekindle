"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, LoaderCircle, PhoneCall, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";

const SIMS = [
  { label: "Agrees to sample", scenario: "sample" },
  { label: "Price objection", scenario: "objection" },
  { label: "Call back later", scenario: "callback" },
  { label: "No answer", scenario: "no_answer" },
];

/** Sarvam "Vyapar SDR" voice agent: shows the input variables it needs and records its structured outcome. */
export function CallPanel({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const [vars, setVars] = useState<Record<string, string> | null>(null);
  const [live, setLive] = useState<{ canCallLive: boolean; missing: string[]; phoneMasked: string; initialBotMessage: string; agent?: { name: string; gender: string; voiceMatches: boolean } } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    fetch(`/api/vyapar/deals/${dealId}/call`).then((r) => r.json()).then((r) => { if (r.ok) { setVars(r.data.variables); setLive(r.data); } }).catch(() => null);
  }, [dealId]);
  async function callNow() {
    setBusy("live");
    const res = await fetch(`/api/vyapar/deals/${dealId}/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "sarvam" }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.ok) { toast(`Calling ${res.data.phoneMasked}… the result appears here after the call`); onClose(); router.refresh(); } else toast(res?.error?.message ?? "Couldn't start the call");
  }
  async function simulate(label: string, scenario: string) {
    setBusy(label);
    const res = await fetch(`/api/vyapar/deals/${dealId}/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "simulated", scenario }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (res?.ok) { toast("Simulated call finished: transcript and outcome saved"); onClose(); router.refresh(); } else toast(res?.error?.message ?? "Couldn't simulate the call");
  }
  return <div className="call-panel rise">
    <div className="row"><PhoneCall size={16} color="var(--pt-navy)" /><b className="grow">AI call · Sarvam &ldquo;Vyapar SDR&rdquo; agent</b><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
    <span className="xs muted">The agent calls in Hinglish with these facts, then returns outcome, objection type, the merchant&apos;s exact words and any callback time.</span>
    {vars ? <div className="vars">{Object.entries(vars).filter(([, v]) => v).map(([k, v]) => <div key={k}><code>{k}</code><span>{v}</span></div>)}</div> : <span className="small muted">Loading…</span>}
    <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(vars, null, 2)); toast("Variables copied"); }} disabled={!vars}><Copy />Copy variables</button>
    {live && (live.canCallLive
      ? <button className="btn btn-primary" onClick={callNow} disabled={busy !== null}>{busy === "live" ? <LoaderCircle className="spin" /> : <PhoneCall />}Call now via Sarvam ({live.phoneMasked})</button>
      : <div className="xs muted">Live calling needs: {live.missing.join(", ")}</div>)}
    {live?.agent && <div className="xs"><b>Agent:</b> {live.agent.name} · {live.agent.gender} voice{live.agent.voiceMatches ? "" : " (live calls use the default voice until the male-voice agent is published)"}</div>}
    {live && <div className="xs"><b>Opening line:</b> {live.initialBotMessage}</div>}
    <span className="small"><b>Or run a simulated call</b> (full transcript, no dialling):</span>
    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>{SIMS.map((s) => <button key={s.label} className="btn btn-ghost btn-sm" onClick={() => simulate(s.label, s.scenario)} disabled={busy !== null}>{busy === s.label && <LoaderCircle className="spin" />}{s.label}</button>)}</div>
  </div>;
}
