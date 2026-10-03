"use client";

import { useEffect, useMemo, useState } from "react";

type Account = { id: string; name: string };
type Result = { normalized: string; cached: boolean; alreadySaved: boolean; memory: { stallCategory: string; summary: string; evidenceQuote: string; evidenceSpeaker: string; confidence: number } };

export function CaptureWorkspace() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("account-finvara");
  const [channel, setChannel] = useState("whatsapp");
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/accounts").then((r) => r.json()).then((body) => setAccounts(body.data)); }, []);
  async function loadSample(name: string) {
    const body = await fetch(`/api/capture/sample?name=${name}`).then((r) => r.json());
    setText(body.data.text); setAccountId(body.data.accountId); setChannel(body.data.channel); setResult(null); setError("");
  }
  async function understand() {
    setStatus("Parsing conversation…"); setError(""); setResult(null);
    const response = await fetch("/api/capture/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, channel, text }) });
    setStatus("Understanding the blocker…");
    const body = await response.json();
    if (!body.ok) { setError(body.error.message); setStatus(""); return; }
    setResult(body.data); setStatus("");
  }
  const highlighted = useMemo(() => {
    if (!result) return text;
    const index = text.toLowerCase().indexOf(result.memory.evidenceQuote.toLowerCase());
    if (index < 0) return text;
    return <>{text.slice(0, index)}<mark>{text.slice(index, index + result.memory.evidenceQuote.length)}</mark>{text.slice(index + result.memory.evidenceQuote.length)}</>;
  }, [result, text]);
  return <div className="capture-grid">
    <section className="panel">
      <div className="sample-row"><button className="button" onClick={() => loadSample("finvara")}>Load Finvara WhatsApp</button><button className="button" onClick={() => loadSample("kredo")}>Load Kredo call</button></div>
      <label className="field-label" htmlFor="account">Account</label><select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select>
      <label className="field-label" htmlFor="channel">Channel</label><select id="channel" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="whatsapp">WhatsApp export</option><option value="email">Email</option><option value="call">Call transcript</option><option value="meeting">Meeting</option><option value="note">Note</option></select>
      <label className="field-label" htmlFor="conversation">Conversation</label><textarea id="conversation" value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder="Paste a conversation or load a sample…" />
      <button className="button primary" disabled={!text.trim()} onClick={understand}>{status || "Understand conversation"}</button>{error && <p className="error">{error}</p>}
    </section>
    <section className="panel capture-preview"><h2>{result ? "Evidence in conversation" : "Conversation preview"}</h2><pre>{highlighted || "Your conversation will appear here."}</pre></section>
    <aside className="panel"><h2>Revenue Memory</h2>{result ? <><span className="badge">{result.memory.stallCategory.replaceAll("_", " ")}</span><div className="headline">{result.memory.summary}</div><div className="memory-quote">“{result.memory.evidenceQuote}”<div className="meta">{result.memory.evidenceSpeaker}</div></div><div className="field"><div className="field-label">Confidence</div><div className="field-value">{Math.round(result.memory.confidence * 100)}% · cached extraction</div></div><div className="badge">Already saved · no duplicate created</div></> : <p className="subtitle">The extracted blocker and verbatim evidence will appear here for review.</p>}</aside>
  </div>;
}
