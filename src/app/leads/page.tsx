import Link from "next/link";
import { db } from "@/lib/db";
import { PromoteButton } from "@/components/discovery/promote-button";
import { ProvenanceBadge, candidateProvenance, formatEvidenceDate } from "@/components/discovery/evidence-list";

export const dynamic = "force-dynamic";

const FILTERS = [{ key: "all", label: "All" }, { key: "live", label: "Live evidence" }, { key: "demo", label: "Demo" }] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: raw } = await searchParams;
  const filter: FilterKey = raw === "live" || raw === "demo" ? raw : "all";
  const all = await db.leadCandidate.findMany({ include: { evidence: { orderBy: { observedAt: "desc" } } }, orderBy: [{ overallScore: "desc" }, { name: "asc" }] });
  const counts = { all: all.length, live: all.filter((lead) => candidateProvenance(lead) === "live").length, demo: all.filter((lead) => lead.isDemo).length };
  const leads = filter === "live" ? all.filter((lead) => candidateProvenance(lead) === "live") : filter === "demo" ? all.filter((lead) => lead.isDemo) : all;
  const real = all.length - counts.demo;
  return <div className="content"><div className="eyebrow">Research workspace</div><h1>Leads</h1><p className="subtitle">Evidence-backed candidate accounts. {real ? `${real} real companies researched from public job boards and news; ` : ""}{counts.demo} fictional demo accounts are labelled Demo.</p>
    <section className="kpis lead-kpis"><div className="kpi"><span className="kpi-label">Candidates</span><span className="kpi-value">{all.length}</span><span className="kpi-note">from the approved ICP</span></div><div className="kpi"><span className="kpi-label">Live evidence</span><span className="kpi-value">{counts.live}</span><span className="kpi-note">job boards or news, linked</span></div><div className="kpi"><span className="kpi-label">High confidence</span><span className="kpi-value">{all.filter((lead) => lead.confidence === "HIGH").length}</span><span className="kpi-note">multiple supporting facts</span></div><div className="kpi"><span className="kpi-label">Shortlisted</span><span className="kpi-value">{all.filter((lead) => lead.status === "SHORTLISTED").length}</span><span className="kpi-note">promoted into Accounts</span></div></section>
    <div className="section-head"><div><h2>Ranked accounts</h2><p>Fit and timing stay separate so activity never substitutes for customer fit.</p></div><a className="button primary" href="/discover">Refine in chat</a></div>
    <div className="chip-row lead-filters">{FILTERS.map((item) => <Link key={item.key} href={item.key === "all" ? "/leads" : `/leads?filter=${item.key}`} className={`lead-filter${filter === item.key ? " active" : ""}`}>{item.label} <span>{counts[item.key]}</span></Link>)}</div>
    <div className="lead-table-wrap"><table className="account-table lead-table"><thead><tr><th>Account</th><th>Fit</th><th>Timing</th><th>Overall</th><th>Why now</th><th>Persona</th><th>Confidence</th><th></th></tr></thead><tbody>{leads.map((lead) => {
      const signal = lead.evidence.find((item) => item.kind === "SIGNAL");
      const top = signal ?? lead.evidence[0];
      const provenance = candidateProvenance(lead);
      return <tr key={lead.id}><td><strong>{lead.name}</strong><div className="meta">{lead.industry} · {lead.city} · {lead.sizeBand}{lead.fundingStage ? ` · ${lead.fundingStage}` : ""}</div></td><td>{lead.fitScore}</td><td>{signal || lead.isDemo ? lead.timingScore : <span className="meta">Unknown</span>}</td><td><span className="mini-score">{lead.overallScore}</span></td>
        <td>{top ? <><strong>{top.sourceUrl ? <a href={top.sourceUrl} target="_blank" rel="noreferrer">{top.title}</a> : top.title}</strong><div className="meta">{top.sourceName} · {formatEvidenceDate(top.observedAt)} · <ProvenanceBadge provenance={top.provenance} />{lead.evidence.length > 1 ? ` · +${lead.evidence.length - 1} more` : ""}</div></> : <span className="meta">Unknown · no public evidence found{provenance === "none" ? "" : ""}</span>}</td>
        <td>{lead.suggestedPersona}</td><td><span className={`confidence-pill ${lead.confidence.toLowerCase()}`}>{lead.confidence}</span></td><td><PromoteButton id={lead.id} accountId={lead.promotedAccountId} /></td></tr>;
    })}</tbody></table>{!leads.length && <p className="meta lead-empty">No leads in this view yet. Run a search from <a href="/discover">Discover</a>.</p>}</div>
  </div>;
}
