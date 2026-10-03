"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Account = { id: string; name: string };
type Sample = { name: string; label: string };
type Stakeholder = { name: string; title: string | null; role: string; sentiment: string };
type Commitment = { by: "us" | "them"; text: string; due_date: string | null; done: boolean };
type MemoryView = {
  stallCategory: string; summary: string; evidenceQuote: string; evidenceSpeaker: string | null; evidenceDate: string | null;
  confidence: number; evidenceVerified: boolean; timing: { text: string | null; resolved_date: string | null; event_trigger: string | null } | null;
  competitor: { name: string | null; contract_end_date: string | null } | null; stakeholders: Stakeholder[]; commitments: Commitment[]; sentiment: string; language: string;
};
type Preview = { normalized: string; cached: boolean; alreadySaved: boolean; provenance: "live" | "cached" | "rules"; lane: string | null; memory: MemoryView };
type Saved = { alreadySaved: boolean; accountId: string; lane: string; laneChanges: { toLane: string; reason: string }[]; provenance: string; memory: MemoryView | null };

const CATEGORIES = ["BUDGET", "TIMING", "NO_OWNER", "CHAMPION_LEFT", "COMPETITOR_LOCKIN", "MISSING_FEATURE", "IMPLEMENTATION_EFFORT", "INTERNAL_APPROVAL", "WENT_DARK", "OTHER"];
const LANE_LABEL: Record<string, string> = { REVIVE: "Revive now", WARM: "Warming up", WATCH: "Watching" };
const PROVENANCE_LABEL: Record<string, string> = { live: "Claude", cached: "Cached", rules: "Rules" };
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function CaptureWorkspace({ initialAccountId }: { initialAccountId?: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [accountId, setAccountId] = useState(initialAccountId ?? "account-finvara");
  const [channel, setChannel] = useState("whatsapp");
  const [text, setText] = useState("");
  const [result, setResult] = useState<Preview | null>(null);
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [offlineMiss, setOfflineMiss] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json()).then((body) => {
      if (!body.ok) return;
      setAccounts(body.data);
      if (initialAccountId && body.data.some((a: Account) => a.id === initialAccountId)) setAccountId(initialAccountId);
    }).catch(() => {});
    fetch("/api/capture/sample").then((r) => r.json()).then((body) => { if (body.ok) setSamples(body.data); }).catch(() => {});
  }, [initialAccountId]);

  function reset() { setResult(null); setSaved(null); setError(""); setOfflineMiss(false); }

  async function loadSample(name: string) {
    const body = await fetch(`/api/capture/sample?name=${name}`).then((r) => r.json());
    if (!body.ok) { setError(body.error.message); return; }
    setText(body.data.text); setAccountId(body.data.accountId); setChannel(body.data.channel); setTranscript(null); reset();
  }

  async function transcribe(file: Blob, filename: string, account?: string) {
    reset(); setStatus("Transcribing voice note…");
    try {
      const form = new FormData();
      form.append("file", file, filename);
      const body = await fetch("/api/transcribe", { method: "POST", body: form }).then((r) => r.json());
      if (!body.ok) { setError(body.error?.message ?? "We couldn't transcribe this. Paste the transcript instead."); return; }
      setText(body.data.text); setChannel("call");
      if (account) setAccountId(account);
      setTranscript(body.data.provider === "sarvam" && !body.data.cached ? "Transcribed by Sarvam" : "Cached transcript");
      if (body.data.warning) setError(body.data.warning);
    } catch {
      setError("We couldn't transcribe this. Paste the transcript instead.");
    } finally { setStatus(""); }
  }

  async function loadSampleVoice() {
    setStatus("Loading voice note…");
    try {
      const response = await fetch("/api/demo/audio");
      if (!response.ok) throw new Error();
      await transcribe(await response.blob(), "kredo_voice_note.wav", "account-kredo");
    } catch { setError("The sample voice note is unavailable."); setStatus(""); }
  }

  async function understand(mode: "auto" | "rules" = "auto") {
    reset();
    setStatus("Parsing conversation…");
    const started = Date.now();
    const request = fetch("/api/capture/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, channel, text, mode }) }).then((r) => r.json());
    await wait(400);
    setStatus("Understanding the blocker…");
    const body = await request.catch(() => ({ ok: false, error: { code: "NETWORK", message: "We couldn't reach the server. Try again." } }));
    if (Date.now() - started < 800) await wait(400);
    setStatus("");
    if (!body.ok) { setError(body.error.message); setOfflineMiss(body.error.code === "OFFLINE_CACHE_MISS"); return; }
    setResult(body.data); setCategory(body.data.memory.stallCategory); setSummary(body.data.memory.summary);
  }

  async function save() {
    if (!result) return;
    setStatus("Saving to Revenue Memory…"); setError("");
    const edits: { stallCategory?: string; summary?: string } = {};
    if (category !== result.memory.stallCategory) edits.stallCategory = category;
    if (summary.trim() && summary.trim() !== result.memory.summary) edits.summary = summary.trim();
    const body = await fetch("/api/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, channel, text, edits: Object.keys(edits).length ? edits : undefined, mode: result.provenance === "rules" ? "rules" : "auto" }) }).then((r) => r.json()).catch(() => ({ ok: false, error: { message: "We couldn't reach the server. Try again." } }));
    setStatus("");
    if (!body.ok) { setError(body.error.message); return; }
    setSaved(body.data);
  }

  const highlighted = useMemo(() => {
    if (!result) return text;
    const quote = result.memory.evidenceQuote;
    let index = text.indexOf(quote);
    if (index < 0) index = text.toLowerCase().indexOf(quote.toLowerCase());
    if (index < 0 || !quote) return text;
    return <>{text.slice(0, index)}<mark>{text.slice(index, index + quote.length)}</mark>{text.slice(index + quote.length)}</>;
  }, [result, text]);

  const memory = result?.memory;
  const lowConfidence = memory && (memory.confidence < 0.5 || !memory.evidenceVerified);

  return <div className="capture-grid">
    <section className="panel">
      <div className="sample-row">
        {(samples.length ? samples : [{ name: "finvara", label: "Finvara WhatsApp" }, { name: "kredo", label: "Kredo call" }]).map((sample) => <button key={sample.name} className="button" onClick={() => loadSample(sample.name)}>Load {sample.label}</button>)}
        <button className="button" onClick={loadSampleVoice} disabled={Boolean(status)}>Load sample voice note</button>
      </div>
      <label className="field-label" htmlFor="account">Account</label>
      <select id="account" value={accountId} onChange={(e) => { setAccountId(e.target.value); reset(); }}>{accounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select>
      <label className="field-label" htmlFor="channel">Channel</label>
      <select id="channel" value={channel} onChange={(e) => { setChannel(e.target.value); reset(); }}><option value="whatsapp">WhatsApp export</option><option value="email">Email</option><option value="call">Call transcript</option><option value="meeting">Meeting</option><option value="note">Note</option></select>
      <label className="field-label" htmlFor="voice">Voice note</label>
      <div className="voice-row">
        <input ref={fileRef} id="voice" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus" onChange={(e) => { const file = e.target.files?.[0]; if (file) void transcribe(file, file.name); e.target.value = ""; }} />
        {transcript && <span className="badge">{transcript}</span>}
      </div>
      <label className="field-label" htmlFor="conversation">Conversation</label>
      <textarea id="conversation" value={text} onChange={(e) => { setText(e.target.value); reset(); }} placeholder="Paste a conversation, upload a voice note, or load a sample…" />
      <button className="button primary" disabled={!text.trim() || Boolean(status)} onClick={() => understand()}>{status || "Understand conversation"}</button>
      {error && <p className="error">{error}</p>}
      {offlineMiss && <button className="button" onClick={() => understand("rules")}>Use rules-based reading instead</button>}
    </section>
    <section className="panel capture-preview"><h2>{result ? "Evidence in conversation" : "Conversation preview"}</h2><pre>{highlighted || "Your conversation will appear here."}</pre></section>
    <aside className="panel">
      <h2>Revenue Memory</h2>
      {memory && result ? <>
        <div className="capture-badges"><span className={`badge prov-${result.provenance}`}>{PROVENANCE_LABEL[result.provenance]}</span>{result.alreadySaved && <span className="badge">Already saved · no duplicate</span>}</div>
        <label className="field-label" htmlFor="category">Stall reason</label>
        <select id="category" value={category} disabled={result.alreadySaved || Boolean(saved)} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
        <label className="field-label" htmlFor="summary">Summary</label>
        <input id="summary" className="text-input" value={summary} maxLength={140} disabled={result.alreadySaved || Boolean(saved)} onChange={(e) => setSummary(e.target.value)} />
        <div className="memory-quote">“{memory.evidenceQuote}”<div className="meta">{memory.evidenceSpeaker ?? "Buyer"}{memory.evidenceDate ? ` · ${memory.evidenceDate.slice(0, 10)}` : ""}</div></div>
        {memory.timing?.text && <div className="field"><div className="field-label">Stated timing</div><div className="field-value">{memory.timing.text}{memory.timing.resolved_date ? ` → ${memory.timing.resolved_date}` : memory.timing.event_trigger ? ` · waits for ${label(memory.timing.event_trigger)}` : ""}</div></div>}
        {memory.competitor?.name && <div className="field"><div className="field-label">Competitor</div><div className="field-value">{memory.competitor.name}{memory.competitor.contract_end_date ? ` until ${memory.competitor.contract_end_date}` : ""}</div></div>}
        {memory.stakeholders.length > 0 && <div className="field"><div className="field-label">Stakeholders</div><div className="field-value">{memory.stakeholders.map((s) => `${s.name}${s.title ? ` (${s.title})` : ""}`).join(", ")}</div></div>}
        {memory.commitments.length > 0 && <div className="field"><div className="field-label">Commitments</div>{memory.commitments.map((c, i) => <div className="field-value" key={i}>{c.by === "us" ? "We promised" : "They promised"}: {c.text}{c.done ? " ✓" : ""}</div>)}</div>}
        <div className="field"><div className="field-label">Confidence</div><div className="field-value">{Math.round(memory.confidence * 100)}% · {memory.evidenceVerified ? "evidence verified" : "quote not found verbatim"}{lowConfidence && <span className="badge check-this">Check this</span>}</div></div>
        {saved ? <div className="saved-box">
          <strong>{saved.alreadySaved ? "Already saved" : "Saved"} · lane {LANE_LABEL[saved.lane] ?? saved.lane}</strong>
          {saved.laneChanges[0] && <div className="meta">Moved to {LANE_LABEL[saved.laneChanges[0].toLane]} · {saved.laneChanges[0].reason}</div>}
          <div className="card-actions"><Link className="button primary" href={`/accounts/${saved.accountId}`}>Open account</Link><Link className="button" href="/today">Back to Today</Link></div>
        </div> : result.alreadySaved ? <div className="card-actions"><Link className="button" href={`/accounts/${accountId}`}>Open account</Link></div>
          : <button className="button primary" onClick={save} disabled={Boolean(status)}>{status || "Looks right, save"}</button>}
      </> : <p className="subtitle">The extracted blocker and verbatim evidence will appear here for review.</p>}
    </aside>
  </div>;
}
