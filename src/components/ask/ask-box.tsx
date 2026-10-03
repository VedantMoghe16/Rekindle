"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";

type Citation = { id: string; kind: string; title: string; accountId: string; accountName: string; href: string; snippet: string };
type Answer = { answer: string; citations: Citation[]; provenance: "cognee" | "local" | "claude" };

const BADGE: Record<Answer["provenance"], string> = { cognee: "Cognee graph", local: "Local search", claude: "Claude" };

export function AskBox({ title = "Ask the pipeline", accountId, suggestions, placeholder }: { title?: string; accountId?: string; suggestions: string[]; placeholder?: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(value = question) {
    const q = value.trim();
    if (q.length < 3) return;
    setQuestion(q); setBusy(true); setError("");
    const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, accountId }) }).then((r) => r.json()).catch(() => ({ ok: false, error: { message: "We couldn't reach the server." } }));
    setBusy(false);
    if (!response.ok) { setError(response.error.message); return; }
    setAnswer(response.data);
  }

  return <section className="panel ask-box">
    <div className="ask-head"><h2>{title}</h2>{answer && <span className={`badge ask-${answer.provenance}`}>{BADGE[answer.provenance]}</span>}</div>
    <form className="ask-form" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
      <input className="text-input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={placeholder ?? "Ask about deals, blockers, promises or signals…"} />
      <button className="button primary" disabled={busy || question.trim().length < 3}><Search /> {busy ? "Thinking…" : "Ask"}</button>
    </form>
    <div className="chip-row ask-chips">{suggestions.map((s) => <button key={s} className="ask-chip" disabled={busy} onClick={() => ask(s)}>{s}</button>)}</div>
    {error && <p className="error">{error}</p>}
    {answer && <div className="ask-answer">
      <div className="ask-text">{answer.answer}</div>
      {answer.citations.length > 0 && <div className="ask-citations"><div className="field-label">Sources</div>{answer.citations.map((c) => <Link key={c.id} href={c.href} className="ask-citation"><strong>{c.title}</strong><span className="meta">{c.snippet}</span></Link>)}</div>}
    </div>}
  </section>;
}
