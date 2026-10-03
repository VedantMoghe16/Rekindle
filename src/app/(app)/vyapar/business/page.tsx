import { BadgeCheck, Clock, Gift, IndianRupee, Package, Truck, Wallet } from "lucide-react";
import { AppBar, Avatar } from "@/components/paytm/ui";
import { VyaparTabs } from "@/components/paytm/nav";
import { getSeller } from "@/lib/vyapar/server/context";
import { learningReadiness, loadPreferenceRows } from "@/lib/vyapar/server/opportunities";
import { rupees } from "@/lib/vyapar/taxonomy";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const s = await getSeller();
  const o = s.offers;
  const [learn, prefRows] = await Promise.all([learningReadiness(), loadPreferenceRows(s.id)]);
  const capacity = prefRows.filter((p) => p.kind === "CAPACITY_ANSWER" && p.active).at(-1);
  const activePrefs = prefRows.filter((p) => p.active && p.kind !== "CAPACITY_ANSWER");
  return <div className="page">
    <AppBar title="My offers" sub="What Vyapar AI is allowed to offer buyers" back="/vyapar" />
    <main className="scroll">
      <div className="pad">
        <div className="card row" style={{ gap: 12 }}>
          <Avatar name={s.merchant.name} />
          <div className="grow"><b style={{ fontSize: 15 }}>{s.merchant.name}</b><div className="small muted">{s.merchant.ownerName} · {s.merchant.area}, {s.merchant.city}</div><div className="row" style={{ marginTop: 4 }}><span className="badge b-cyan"><BadgeCheck />Paytm verified</span><span className="badge b-grey">MCC {s.merchant.mcc}</span></div></div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}><span className="row"><Package size={16} />Catalogue</span></div>
          {o.catalog.map((c) => <div className="list-row" key={c.sku}><div className="grow"><b>{c.name}</b><small>SKU {c.sku}</small></div><b style={{ color: "var(--pt-navy)" }}>{rupees(c.unitPriceInr)}</b></div>)}
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}><span className="row"><IndianRupee size={16} />Pricing the AI can use</span></div>
          {o.tiers.map((t) => <div className="list-row" key={t.label}><div className="grow"><b>{t.label}: {rupees(t.unitPriceInr)}/pc</b><small>{t.minQty.toLocaleString("en-IN")}+ pcs · launched {new Date(`${t.launchedOn}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></div><span className="badge b-green">Active</span></div>)}
          <div className="list-row"><div className="grow"><b>Minimum order</b><small>Smallest trial order</small></div><b>{o.moq} pcs</b></div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Promises the AI can make</div>
          <div className="list-row"><Gift size={18} color="var(--pt-cyan-600)" /><div className="grow"><b>Free sample</b><small>{o.freeSample.contents} · up to {o.freeSample.perWeek}/week</small></div><span className="badge b-green">On</span></div>
          <div className="list-row"><Wallet size={18} color="var(--pt-cyan-600)" /><div className="grow"><b>{o.credit.days}-day credit</b><small>{o.credit.viaPaytmPostpaid ? "Via Paytm Postpaid. You get paid upfront" : "Direct credit"}</small></div><span className="badge b-green">On</span></div>
          <div className="list-row"><Truck size={18} color="var(--pt-cyan-600)" /><div className="grow"><b>Same-day delivery</b><small>Within {o.deliveryRadiusKm} km · order by {o.sameDayCutoff}</small></div><span className="badge b-green">On</span></div>
          <div className="list-row"><Clock size={18} color="var(--pt-cyan-600)" /><div className="grow"><b>Autopilot replies</b><small>AI answers objections; you approve first pitches</small></div><span className={`badge ${s.autopilot ? "b-green" : "b-grey"}`}>{s.autopilot ? "On" : "Off"}</span></div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>What Vyapar learned from you</div>
          <div className="list-row"><div className="grow"><b>Monthly volume per buyer</b><small>{capacity ? `You ${capacity.label}` : "Not answered yet. Asked when a high-volume buyer appears"}</small></div><span className={`badge ${capacity ? "b-green" : "b-amber"}`}>{capacity ? "Answered" : "Unknown"}</span></div>
          {activePrefs.map((p) => <div className="list-row" key={p.id}><div className="grow"><b style={{ fontWeight: 600 }}>{p.kind === "SAVE" ? "Saved" : "You said"}: {p.label}</b><small>Undo from the search where you gave it</small></div></div>)}
          {!activePrefs.length && <p className="small muted">No skips or saves yet. Each one tunes your shortlist and can be undone.</p>}
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Learning readiness <span className="badge b-grey">{learn.ranker}</span></div>
          <div className="list-row"><div className="grow"><b>Leads shown (logged with position)</b></div><b>{learn.exposures}</b></div>
          <div className="list-row"><div className="grow"><b>Your actions</b><small>saves, skips, edits, sends, visits</small></div><b>{learn.sellerActions}</b></div>
          <div className="list-row"><div className="grow"><b>Simulated buyer outcomes</b><small>demo replies, never used for training</small></div><b>{learn.simulatedOutcomes}</b></div>
          <div className="list-row"><div className="grow"><b>Real delivered contacts with outcomes</b><small>needs WhatsApp integration</small></div><b>{learn.realLabels} / {learn.minimumForTraining}</b></div>
          <p className="xs muted" style={{ marginTop: 6 }}>Ranking is a transparent rules engine today. A learned ranker is only trained once enough real, delivered contacts and outcomes exist, evaluated on a later time window.</p>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Proof points used in pitches</div>
          {o.proofPoints.map((p) => <div className="list-row" key={p}><BadgeCheck size={16} color="var(--pt-green)" /><span className="small">{p}</span></div>)}
        </div>
      </div>
    </main>
    <VyaparTabs />
  </div>;
}
