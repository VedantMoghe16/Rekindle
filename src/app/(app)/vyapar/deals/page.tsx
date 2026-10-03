import { AppBar, inr } from "@/components/paytm/ui";
import { HomeNav, VyaparTabs } from "@/components/paytm/nav";
import { DealList } from "@/components/vyapar/deals-board";
import { AskBox } from "@/components/vyapar/ask-box";
import { getDealsOverview } from "@/lib/vyapar/server/insights";
import { visitRoute } from "@/lib/vyapar/server/opportunities";
import { sellerRequests } from "@/lib/vyapar/server/needs";
import { PRODUCTS, type ProductKey } from "@/lib/vyapar/needs";
import Link from "next/link";
import { ChevronRight, MapPin, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { ensureFollowupWorker } from "@/lib/vyapar/server/followups";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  ensureFollowupWorker();
  const [o, visits, requests, waiting, scheduled] = await Promise.all([getDealsOverview(), visitRoute(), sellerRequests(), db.vyaparFollowup.count({ where: { status: "PROPOSED" } }), db.vyaparFollowup.count({ where: { status: "APPROVED" } })]);
  const pending = requests.filter((r) => r.status === "REQUESTED");
  const max = Math.max(1, o.funnel[0].value);
  return <div className="page">
    <AppBar title="My Deals" sub="Vyapar AI · your merchant pipeline" />
    <VyaparTabs />
    <main className="scroll">
      <div className="pad">
        <div className="kpis">
          <div className="kpi"><small>Pipeline value</small><b>{inr(o.kpis.pipelineInr)}</b><div className="delta">monthly orders in talks</div></div>
          <div className="kpi"><small>Orders won</small><b>{inr(o.kpis.wonInr)}</b><div className="delta">{o.kpis.wonCount} new buyer{o.kpis.wonCount === 1 ? "" : "s"}</div></div>
          <div className="kpi"><small>Reply rate</small><b>{o.kpis.replyRate}%</b><div className="delta">vs ~9% for cold calls</div></div>
          <div className="kpi"><small>Time saved</small><b>{o.kpis.hoursSaved} hrs</b><div className="delta">no door-to-door</div></div>
        </div>
        <Link href="/vyapar/followups" className="card row fu-entry">
          <span className="fu-ic"><RefreshCw size={18} /></span>
          <div className="grow"><b>Follow-ups</b><small>{waiting ? `${waiting} ready for your OK` : "Quiet & lost leads, followed up safely"}{scheduled ? ` · ${scheduled} scheduled` : ""}</small></div>
          {waiting > 0 && <span className="badge b-amber">{waiting}</span>}<ChevronRight size={18} />
        </Link>
        {pending.length > 0 && <div className="revive" style={{ borderColor: "#fde7b0", background: "linear-gradient(135deg,#fff 0%,#fff8e6 100%)" }}>
          <div className="h"><span className="badge b-amber">Buyer request</span><b className="grow">{pending.length === 1 ? `${pending[0].buyer.name} picked you` : `${pending.length} buyers picked you`}</b></div>
          {pending.map((r) => <Link key={r.id} href={`/vyapar/requests/${r.id}`} className="list-row"><div className="grow"><b>{r.buyer.name}</b><small>Needs {r.terms.quantity.toLocaleString("en-IN")} {PRODUCTS[r.need.productKey as ProductKey].label.toLowerCase()}es by {r.need.neededBy}{r.need.sampleFirst ? " · sample first" : ""}</small></div><span className="btn btn-primary btn-sm">Reply</span></Link>)}
        </div>}
        {visits.length > 0 && <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}><span className="row"><MapPin size={16} />Visit route ({visits.length})</span><span className="xs muted">nearest first</span></div>
          {visits.map((v, i) => <Link key={v.leadId} href={`/vyapar/merchants/${v.merchantId}`} className="list-row"><b style={{ width: 22, height: 22, borderRadius: 11, background: "var(--pt-cyan-50)", display: "grid", placeItems: "center", fontSize: 11 }}>{i + 1}</b><div className="grow"><b>{v.name}</b><small>{v.category} · {v.street} · {v.distanceKm} km</small></div></Link>)}
          <p className="xs muted" style={{ marginTop: 6 }}>No verified contact for these, so take a sample and ask who handles purchases.</p>
        </div>}
        <DealList rows={o.rows.map(({ lastTouchAt: _l, ...r }) => r)} />
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Pipeline <span className="xs muted">{o.funnel[0].value} merchants</span></div>
          <div className="funnel">{o.funnel.map((f) => <div className="fr" key={f.label}><span>{f.label}</span><span className="bar"><i style={{ width: `${(f.value / max) * 100}%` }} /></span><b>{f.value}</b></div>)}</div>
        </div>
        <div className="card stack">
          <div className="card-title">Ask about your buyers</div>
          <AskBox placeholder="e.g. Which bakeries said price is too high?" initial="Which buyers said price is too high?" />
        </div>
      </div>
    </main>
    <HomeNav />
  </div>;
}
