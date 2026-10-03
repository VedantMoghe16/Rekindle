"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, Search } from "lucide-react";
import { ProviderTag } from "@/components/paytm/ui";

type Answer = { answer: string; sources: { merchantId: string; name: string; quote: string | null }[]; provenance: string };

export function AskBox({ merchantId, placeholder, initial }: { merchantId?: string; placeholder: string; initial?: string }) {
  const [q, setQ] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true);
    const res = await fetch("/api/vyapar/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, merchantId }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    setAnswer(res?.ok ? res.data : { answer: "Couldn't search memory right now.", sources: [], provenance: "local" });
  }
  return <div className="stack">
    <form className="ask" onSubmit={ask}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Ask about your buyers" /><button className="btn btn-primary btn-sm" disabled={busy} aria-label="Ask">{busy ? <LoaderCircle className="spin" /> : <Search />}</button></form>
    {answer && <div className="answer rise">
      <div>{answer.answer}</div>
      {answer.sources.length > 0 && <div className="xs muted">Sources: {answer.sources.map((s, i) => <span key={`${s.merchantId}-${i}`}>{i > 0 && ", "}<Link className="link" style={{ fontSize: 11 }} href={`/vyapar/merchants/${s.merchantId}`}>{s.name}</Link></span>)}</div>}
      <div className="row"><span className="xs muted">Answered from</span><ProviderTag provider={answer.provenance} /></div>
    </div>}
  </div>;
}
