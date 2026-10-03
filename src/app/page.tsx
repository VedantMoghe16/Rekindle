import { greetingDate } from "@/lib/clock";
import { formatINR } from "@/lib/format";
import { getBrief } from "@/lib/services/brief";
import { RecommendationCard } from "@/components/brief/recommendation-card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const brief = await getBrief();
  return <div className="content">
    <div className="eyebrow">Daily brief · {greetingDate()}</div>
    <h1>Good morning, Ananya.</h1>
    <p className="subtitle">{brief.revive.length} deals are ready to revive. {brief.warm.length} are warming up.</p>
    <section className="kpis">
      <div className="kpi"><span className="kpi-label">Dormant pipeline</span><span className="kpi-value">{formatINR(brief.totalValue)}</span><span className="kpi-note">{brief.stalledCount} stalled deals</span></div>
      <div className="kpi"><span className="kpi-label">Revive now</span><span className="kpi-value">{brief.revive.length}</span><span className="kpi-note">{formatINR(brief.reviveValue)} ready to reopen</span></div>
      <div className="kpi"><span className="kpi-label">Warming up</span><span className="kpi-value">{brief.warm.length}</span><span className="kpi-note">accounts with weaker signals</span></div>
      <div className="kpi"><span className="kpi-label">Signals this week</span><span className="kpi-value">{brief.signalsThisWeek}</span><span className="kpi-note">{brief.liveSignalsThisWeek} live</span></div>
    </section>
    <div className="section-head"><div><h2>Revive now</h2><p>The strongest reasons to reopen a conversation today.</p></div><span className="badge">Ranked by evidence + value</span></div>
    <div className="rec-list">{brief.revive.map((deal) => <RecommendationCard key={deal.id} deal={deal} />)}</div>
    <div className="section-head"><div><h2>Warming up</h2><p>Signals are promising, but the blocker has not fully moved.</p></div></div>
    <table className="warm-table"><tbody>{brief.warm.map((deal) => <tr key={deal.id}><td><strong>{deal.account.name}</strong><div className="meta">{deal.account.industry}</div></td><td><span className="lane warm">WARM</span></td><td>{deal.memory?.stallCategory.replaceAll("_", " ")}</td><td>{deal.account.signals[0]?.title}</td><td><Link href={`/accounts/${deal.account.id}`}>Open →</Link></td></tr>)}</tbody></table>
    <div className="section-head"><div><h2>Watching</h2><p>{brief.watch.length} deals watched — no meaningful change yet.</p></div><span className="badge">Collapsed</span></div>
  </div>;
}
