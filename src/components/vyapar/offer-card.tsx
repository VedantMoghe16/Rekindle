"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleHelp, LoaderCircle, Send, X } from "lucide-react";
import { toast } from "@/components/paytm/toast";

type Criterion = { id: string; status: string; label: string };
export type OfferMatch = {
  offerId: string; eligibility: string; reason: string | null; criteria: Criterion[];
  quote: { unitPricePaise: number; subtotalPaise: number; tier: string } | null; earliestDelivery: string; distanceKm: number;
  offer: { name: string; sampleNote: string | null; confirmedAt: string | null };
  seller: { id: string; name: string; area: string };
  intro: { id: string; status: string } | null;
};

const rs = (p: number) => { const r = p / 100; return `₹${Number.isInteger(r) ? r.toLocaleString("en-IN") : r.toFixed(2)}`; };
const icon = (s: string) => (s === "PASS" ? <Check size={13} color="var(--pt-green)" /> : s === "FAIL" ? <X size={13} color="var(--pt-red)" /> : <CircleHelp size={13} color="var(--pt-amber)" />);

export function OfferCard({ needId, m, best, canRequest }: { needId: string; m: OfferMatch; best?: boolean; canRequest: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function request() {
    setBusy(true);
    const res = await fetch(`/api/vyapar/needs/${needId}/introductions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId: m.offerId }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) { toast(`Request sent to ${m.seller.name}`); router.refresh(); } else toast(res?.error?.message ?? "Couldn't send");
  }
  const when = new Date(m.earliestDelivery).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
  const status = m.intro?.status === "ACCEPTED" ? "Seller replied" : m.intro?.status === "DECLINED" ? "Seller declined" : m.intro ? "Request sent" : null;
  return <article className={`opp${best ? " top" : ""}`}>
    <div className="opp-head">
      <div className="opp-photo" style={{ backgroundImage: "url(/merchants/packaging.jpg)" }} role="img" aria-label="Representative photo"><span className="src-pill demo">Paytm · demo</span></div>
      <div className="grow" style={{ minWidth: 0 }}>
        <h3>{m.seller.name}</h3>
        <div className="meta"><span>{m.offer.name}</span><span>· {m.distanceKm} km · {m.seller.area}</span></div>
        {m.quote && <div className="price-row"><b>{rs(m.quote.unitPricePaise)}</b><span className="small muted"> each · {rs(m.quote.subtotalPaise)} total{m.quote.tier !== "base price" ? ` (${m.quote.tier})` : ""}</span></div>}
      </div>
    </div>
    <div className="opp-scores">
      {best && <span className="badge b-green">Best price</span>}
      <span className="badge b-cyan">Delivers by {when}</span>
      {m.offer.sampleNote && <span className="badge b-amber">{m.offer.sampleNote.split(":")[0]}</span>}
    </div>
    <div className="opp-sec">{m.criteria.map((c) => <div className="ev" key={c.id}>{icon(c.status)}<span>{c.label}</span></div>)}</div>
    {m.eligibility === "READY" && <div className="actions">
      {status ? <span className="badge b-navy" style={{ justifySelf: "start" }}>{status}</span>
        : <button className="btn btn-primary" onClick={request} disabled={busy || !canRequest}>{busy ? <LoaderCircle className="spin" /> : <Send />}Request{m.offer.sampleNote ? " sample" : ""} from {m.seller.name.split(" ")[0]}</button>}
    </div>}
  </article>;
}
