import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatINR, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await db.account.findUnique({ where: { id }, include: { contacts: true, signals: { orderBy: { occurredAt: "desc" } }, deals: { include: { memory: true, interactions: { orderBy: { occurredAt: "desc" } }, recommendations: { where: { isCurrent: true } } } } } });
  if (!account) notFound();
  const deal = account.deals[0]; const memory = deal.memory; const rec = deal.recommendations[0];
  return <div className="content"><div className="eyebrow">Account brain · <span className="badge">Demo data</span></div><h1>{account.name}</h1><p className="subtitle">{account.industry} · {account.city} · {deal.valueInr ? `${formatINR(deal.valueInr)} opportunity` : "Newly shortlisted lead"} · <span className={`lane ${deal.lane.toLowerCase()}`}>{deal.lane}</span></p>
    <div className="account-grid">
      <section className="panel"><h2>Revenue memory</h2>{memory ? <><div className="field-label">Stall reason</div><div className="field-value"><span className="badge">{memory.stallCategory.replaceAll("_", " ")}</span><p>{memory.summary}</p></div><div className="memory-quote">“{memory.evidenceQuote}”<div className="meta">{memory.evidenceSpeaker} · {formatShortDate(memory.evidenceDate ?? deal.stalledAt!)}</div></div>
        <div className="field"><div className="field-label">Sentiment</div><div className="field-value">{memory.sentiment}</div></div><div className="field"><div className="field-label">Confidence</div><div className="field-value">{Math.round(memory.confidence * 100)}% · evidence verified</div></div></> : <><p className="subtitle">No buyer conversation has been captured yet. Discovery evidence is retained in the timeline.</p><a className="button primary" href={`/capture?account=${account.id}`}>Add conversation</a></>}
      </section>
      <section className="panel"><h2>Relationship timeline</h2>{account.signals.map((signal) => <div className="timeline-item" key={signal.id}><div className="field-label">{formatShortDate(signal.occurredAt)} · {signal.sourceName} · {signal.provenance === "computed" ? "Computed" : "Demo data"}</div><div className="field-value"><strong>{signal.title}</strong><div className="meta">{signal.detail}</div></div></div>)}{deal.interactions.map((interaction) => <div className="timeline-item" key={interaction.id}><div className="field-label">{formatShortDate(interaction.occurredAt)} · {interaction.channel}</div><div className="field-value"><strong>Conversation captured</strong><div className="meta">Revenue Memory extracted from this interaction.</div></div></div>)}</section>
      <aside className="panel"><h2>Next best action</h2>{rec ? <><span className={`lane ${deal.lane.toLowerCase()}`}>{deal.lane}</span><div className="headline">{rec.headline}</div><p className="why">{rec.explanation}</p><div className="field"><div className="field-label">Score</div><div className="field-value">{deal.priorityScore} priority · {deal.matchScore} match</div></div><button className="button primary">Generate draft</button></> : <p className="subtitle">Keep watching. There is no actionable signal yet.</p>}<div className="field"><div className="field-label">Signals</div>{account.signals.map((signal) => <div className="field-value" key={signal.id}>{signal.title}</div>)}</div></aside>
    </div>
  </div>;
}
