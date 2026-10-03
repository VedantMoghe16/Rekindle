import { db } from "@/lib/db";
import { PromoteButton } from "@/components/discovery/promote-button";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await db.leadCandidate.findMany({ include: { evidence: { orderBy: { observedAt: "desc" } } }, orderBy: [{ overallScore: "desc" }, { name: "asc" }] });
  return <div className="content"><div className="eyebrow">Research workspace</div><h1>Leads</h1><p className="subtitle">Evidence-backed candidate accounts. All current results are fictional demo data.</p>
    <section className="kpis lead-kpis"><div className="kpi"><span className="kpi-label">Candidates</span><span className="kpi-value">{leads.length}</span><span className="kpi-note">from the approved ICP</span></div><div className="kpi"><span className="kpi-label">High confidence</span><span className="kpi-value">{leads.filter((lead) => lead.confidence === "HIGH").length}</span><span className="kpi-note">multiple supporting facts</span></div><div className="kpi"><span className="kpi-label">Shortlisted</span><span className="kpi-value">{leads.filter((lead) => lead.status === "SHORTLISTED").length}</span><span className="kpi-note">promoted into Accounts</span></div></section>
    <div className="section-head"><div><h2>Ranked accounts</h2><p>Fit and timing stay separate so activity never substitutes for customer fit.</p></div><a className="button primary" href="/discover">Refine in chat</a></div>
    <div className="lead-table-wrap"><table className="account-table lead-table"><thead><tr><th>Account</th><th>Fit</th><th>Timing</th><th>Overall</th><th>Why now</th><th>Persona</th><th>Confidence</th><th></th></tr></thead><tbody>{leads.map((lead) => { const signal = lead.evidence.find((item) => item.kind === "SIGNAL"); return <tr key={lead.id}><td><strong>{lead.name}</strong><div className="meta">{lead.industry} · {lead.city} · {lead.sizeBand}</div></td><td>{lead.fitScore}</td><td>{lead.timingScore}</td><td><span className="mini-score">{lead.overallScore}</span></td><td><strong>{signal?.title}</strong><div className="meta">{signal?.sourceName} · Demo data</div></td><td>{lead.suggestedPersona}</td><td><span className={`confidence-pill ${lead.confidence.toLowerCase()}`}>{lead.confidence}</span></td><td><PromoteButton id={lead.id} accountId={lead.promotedAccountId} /></td></tr>; })}</tbody></table></div>
  </div>;
}
