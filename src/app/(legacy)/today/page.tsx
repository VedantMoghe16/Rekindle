import Link from "next/link";
import { greetingDate } from "@/lib/clock";
import { formatINR } from "@/lib/format";
import { getBrief } from "@/lib/services/brief";
import { RecommendationCard } from "@/components/brief/recommendation-card";
import { ColdList, type ColdItem } from "@/components/brief/cold-list";
import { AskBox } from "@/components/ask/ask-box";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const brief = await getBrief();
  const cold: ColdItem[] = brief.cold.map((item) => ({ ...item, valueLabel: formatINR(item.valueInr) }));
  return <div className="content">
    <div className="eyebrow">Daily brief · {greetingDate()}</div>
    <h1>Good morning, Ananya.</h1>
    <p className="subtitle">{brief.revive.length} deals are ready to revive. {brief.warm.length} are warming up.</p>
    <section className="kpis kpis-5">
      <div className="kpi"><span className="kpi-label">Dormant pipeline</span><span className="kpi-value">{formatINR(brief.totalValue)}</span><span className="kpi-note">{brief.stalledCount} stalled deals</span></div>
      <div className="kpi"><span className="kpi-label">Revive now</span><span className="kpi-value">{brief.revive.length}</span><span className="kpi-note">{formatINR(brief.reviveValue)} ready to reopen</span></div>
      <div className="kpi"><span className="kpi-label">Warming up</span><span className="kpi-value">{brief.warm.length}</span><span className="kpi-note">accounts with weaker signals</span></div>
      <div className="kpi"><span className="kpi-label">Signals this week</span><span className="kpi-value">{brief.signalsThisWeek}</span><span className="kpi-note">{brief.liveSignalsThisWeek} live</span></div>
      <div className="kpi"><span className="kpi-label">Going cold</span><span className="kpi-value">{brief.cold.length}</span><span className="kpi-note">{formatINR(brief.coldValue)} at risk</span></div>
    </section>
    <div className="ask-section">
      <AskBox title="Ask the pipeline" suggestions={["Which deals are blocked on implementation effort and what did they say?", "Which deals are stuck on budget?", "Who is locked into a competitor contract?"]} />
    </div>
    <div className="section-head"><div><h2>Revive now</h2><p>The strongest reasons to reopen a conversation today.</p></div><span className="badge">Ranked by evidence + value</span></div>
    <div className="rec-list">{brief.revive.length ? brief.revive.map((deal) => <RecommendationCard key={deal.id} deal={deal} />) : <p className="subtitle">No deals ready today. {brief.watch.length} are being watched. We&apos;ll tell you when something changes.</p>}</div>
    {brief.done.length > 0 && <div className="done-strip"><span className="field-label">Done today</span>{brief.done.map((deal) => <Link key={deal.id} className="badge done" href={`/accounts/${deal.account.id}`}>✓ {deal.account.name}</Link>)}</div>}
    <div className="section-head"><div><h2>Going cold</h2><p>Open deals with no reply for more than two weeks. A light nudge now beats a revival later.</p></div><span className="badge">{formatINR(brief.coldValue)} at risk</span></div>
    {cold.length ? <ColdList items={cold} /> : <p className="subtitle">Nothing is going cold. Every open deal has been touched in the last 14 days.</p>}
    <div className="section-head"><div><h2>Warming up</h2><p>Signals are promising, but the blocker has not fully moved.</p></div></div>
    <table className="warm-table"><tbody>{brief.warm.map((deal) => <tr key={deal.id}><td><strong>{deal.account.name}</strong><div className="meta">{deal.account.industry}</div></td><td><span className="lane warm">WARM</span></td><td>{deal.memory?.stallCategory.replaceAll("_", " ")}</td><td>{deal.account.signals[0]?.title}</td><td><Link href={`/accounts/${deal.account.id}`}>Open →</Link></td></tr>)}</tbody></table>
    <div className="section-head"><div><h2>Watching</h2><p>{brief.watch.length} deals watched — no meaningful change yet.</p></div><span className="badge">Collapsed</span></div>
  </div>;
}
