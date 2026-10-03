"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Brain, Check, MessageCircle, Send, Zap } from "lucide-react";
import { Avatar, ScoreRing } from "@/components/paytm/ui";
import type { Reason } from "@/lib/vyapar/taxonomy";

export type LeadItem = {
  id: string; status: string; dealId: string | null; fitScore: number; distanceKm: number; signal: string | null; reasons: Reason[];
  breakdown?: { relevance: number; proximity: number; capacity: number; timing: number; evidence: number; total: number };
  contact: { name: string; role: string; channel: string; reason: string };
  merchant: { id: string; name: string; category: string; rating: number | null; reviewCount: number | null; qrVolumeBand: string };
};

const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
const compact = (n: number | null) => (n == null ? "" : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

export function LeadList({ leads }: { leads: LeadItem[] }) {
  const [filter, setFilter] = useState<string>("all");
  const categories = [...new Set(leads.map((l) => l.merchant.category))];
  const shown = leads.filter((l) => filter === "all" || (filter === "signal" ? Boolean(l.signal) : l.merchant.category === filter));
  return <>
    <div className="filters" role="tablist">
      <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {leads.length}</button>
      {categories.map((c) => <button key={c} className={filter === c ? "on" : ""} onClick={() => setFilter(c)}>{c} {leads.filter((l) => l.merchant.category === c).length}</button>)}
      {leads.some((l) => l.signal) && <button className={filter === "signal" ? "on" : ""} onClick={() => setFilter("signal")}><Zap />Buying signals {leads.filter((l) => l.signal).length}</button>}
    </div>
    <div className="stack" style={{ marginTop: 10 }}>
      {shown.map((l, i) => <article key={l.id} className={`lead${i === 0 && filter === "all" && !l.dealId ? " top" : ""}`}>
        <div className="row1">
          <Avatar name={l.merchant.name} />
          <div className="grow">
            <h3>{l.merchant.name} <BadgeCheck aria-label="Paytm verified merchant" /></h3>
            <div className="meta"><span>{l.merchant.category}</span><span>· {fmtKm(l.distanceKm)}</span>{l.merchant.rating && <><span className="star">★ {l.merchant.rating}</span><span>({compact(l.merchant.reviewCount)})</span></>}<span>· QR {l.merchant.qrVolumeBand}</span></div>
            <div className="row" style={{ marginTop: 6, gap: 6, flexWrap: "wrap" }}>
              {l.signal && <span className="badge b-green"><Zap />{i === 0 && filter === "all" && !l.dealId ? `Best match · ${l.signal.toLowerCase()}` : l.signal}</span>}
              {l.status === "IN_TALKS" && <span className="badge b-navy"><MessageCircle />Already in talks</span>}
            </div>
          </div>
          <ScoreRing value={l.fitScore} />
        </div>
        <div className="why">
          <div><Check /><span><b>Contact {l.contact.name}</b> · {l.contact.role} on {l.contact.channel}</span><span className="src">{l.contact.reason}</span></div>
          {l.reasons.slice(0, 3).map((r) => <div key={r.text}><Check /><span>{r.text}</span><span className="src">{r.source}</span></div>)}
        </div>
        {l.breakdown && <div className="score-breakdown" aria-label="Lead score breakdown">
          <span>Relevance {l.breakdown.relevance}/35</span><span>Timing {l.breakdown.timing}/20</span><span>Evidence {l.breakdown.evidence}/15</span>
        </div>}
        <div className="actions">
          <Link className="btn btn-ghost" href={`/vyapar/merchants/${l.merchant.id}`}><Brain />Profile</Link>
          {l.dealId
            ? <Link className="btn btn-navy" href={`/vyapar/deals/${l.dealId}`}><MessageCircle />Open chat</Link>
            : <Link className="btn btn-primary" href={`/vyapar/leads/${l.id}`}><Send />Pitch</Link>}
        </div>
      </article>)}
      {!shown.length && <div className="empty">No buyers match this filter.</div>}
    </div>
  </>;
}
