import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { formatINR, formatShortDate } from "@/lib/format";
import { RecActions } from "@/components/brief/rec-actions";
import { DraftPanel } from "@/components/brief/draft-panel";
import { PROVENANCE_LABEL } from "@/components/brief/recommendation-card";
import { AskBox } from "@/components/ask/ask-box";

export const dynamic = "force-dynamic";

type Timing = { text: string | null; resolved_date: string | null; event_trigger: string | null };
type Competitor = { name: string | null; contract_end_date: string | null };
type Missing = { description: string | null; feature_key: string | null };
type Stakeholder = { name: string; title: string | null; role: string; sentiment: string };
type Commitment = { by: "us" | "them"; text: string; due_date: string | null; done: boolean };

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", call: "Call", meeting: "Meeting", note: "Note" };

function highlight(text: string, quote: string) {
  const index = quote ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1;
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + quote.length)}</mark>{text.slice(index + quote.length)}</>;
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await db.account.findUnique({ where: { id }, include: { contacts: true, signals: { orderBy: { occurredAt: "desc" } }, deals: { include: { memory: true, interactions: { orderBy: { occurredAt: "desc" } }, recommendations: { where: { isCurrent: true } }, outcomes: { where: { isSeeded: false }, orderBy: { occurredAt: "desc" }, take: 10 } } } } });
  if (!account) notFound();
  const deal = account.deals.find((d) => !["won", "lost"].includes(d.stage) && d.memory) ?? account.deals.find((d) => !["won", "lost"].includes(d.stage)) ?? account.deals[0];
  if (!deal) notFound();
  const memory = deal.memory; const rec = deal.recommendations[0];
  const timing = memory ? JSON.parse(memory.timingJson) as Timing : null;
  const competitor = memory ? JSON.parse(memory.competitorJson) as Competitor : null;
  const missing = memory ? JSON.parse(memory.missingFeatureJson) as Missing : null;
  const stakeholders = memory ? JSON.parse(memory.stakeholdersJson) as Stakeholder[] : [];
  const commitments = memory ? JSON.parse(memory.commitmentsJson) as Commitment[] : [];
  const lastChannel = deal.interactions[0]?.channel;
  const defaultChannel = lastChannel === "email" ? "email" as const : "whatsapp" as const;
  const daysSilent = deal.lastTouchAt ? Math.floor((now().getTime() - deal.lastTouchAt.getTime()) / 86_400_000) : null;
  const breakdown = rec ? JSON.parse(rec.scoreBreakdownJson || "{}") as { match?: number; value?: number; freshness?: number } : {};
  const live = account.signals.some((s) => s.provenance === "live");
  type Item = { key: string; date: Date; kind: string; title: string; body: React.ReactNode };
  const timeline: Item[] = [
    ...account.signals.map((signal) => ({ key: signal.id, date: signal.occurredAt, kind: `${signal.sourceName} · ${PROVENANCE_LABEL[signal.provenance] ?? signal.provenance}`, title: signal.title, body: <>{signal.detail && signal.detail !== signal.title && <div className="meta">{signal.detail}</div>}{signal.sourceUrl && <a href={signal.sourceUrl} target="_blank" rel="noreferrer">source ↗</a>}</> })),
    ...deal.interactions.map((interaction) => ({ key: interaction.id, date: interaction.occurredAt, kind: CHANNEL[interaction.channel] ?? interaction.channel, title: "Conversation captured", body: <details><summary className="meta">Show conversation</summary><pre className="timeline-text">{highlight(interaction.normalizedText, memory?.evidenceInteractionId === interaction.id ? memory.evidenceQuote : "")}</pre></details> })),
    ...deal.outcomes.map((outcome) => ({ key: outcome.id, date: outcome.occurredAt, kind: "Outcome", title: `Recommendation ${outcome.event}`, body: null })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return <div className="content"><div className="eyebrow">Account brain · <span className="badge">{live ? "Live" : account.isDemo ? "Demo data" : "Real account"}</span></div><h1>{account.name}</h1><p className="subtitle">{[account.industry, account.sizeBand, account.city].filter(Boolean).join(" · ")}{account.domain && <> · <a href={`https://${account.domain}`} target="_blank" rel="noreferrer">{account.domain}</a></>} · {deal.valueInr ? `${formatINR(deal.valueInr)} opportunity` : "Newly added account"} · {deal.stage} · <span className={`lane ${deal.lane.toLowerCase()}`}>{deal.lane}</span></p>
    <div className="account-grid">
      <section className="panel"><h2>Revenue memory</h2>{memory ? <>
        <div className="field-label">Stall reason</div><div className="field-value"><span className="badge">{label(memory.stallCategory)}</span><p>{memory.summary}</p></div>
        <div className="memory-quote">“{memory.evidenceQuote}”<div className="meta">{memory.evidenceSpeaker} · {formatShortDate(memory.evidenceDate ?? deal.stalledAt ?? deal.lastTouchAt ?? now())}{lastChannel ? ` · ${CHANNEL[lastChannel] ?? lastChannel}` : ""}</div></div>
        {timing?.text && <div className="field"><div className="field-label">Stated timing</div><div className="field-value">“{timing.text}” → {timing.resolved_date ?? (timing.event_trigger ? `waits for ${label(timing.event_trigger)}` : "event-based")}</div></div>}
        {competitor?.name && <div className="field"><div className="field-label">Competitor</div><div className="field-value">{competitor.name}{competitor.contract_end_date ? ` · contract ends ${competitor.contract_end_date}` : ""}</div></div>}
        {missing?.description && <div className="field"><div className="field-label">Missing feature</div><div className="field-value">{missing.description}{missing.feature_key ? <span className="meta"> · {missing.feature_key}</span> : null}</div></div>}
        {stakeholders.length > 0 && <div className="field"><div className="field-label">Stakeholders</div>{stakeholders.map((s) => <div className="field-value" key={s.name}><span className={`sentiment-dot ${s.sentiment}`} /> {s.name}{s.title ? `, ${s.title}` : ""} <span className="badge">{label(s.role)}</span></div>)}</div>}
        {commitments.length > 0 && <div className="field"><div className="field-label">Commitments</div>{commitments.map((c, i) => <div className="field-value" key={i}>{c.by === "us" ? "We promised" : "They promised"}: {c.text}{c.done ? " ✓" : ""}{c.due_date ? <span className="meta"> · by {c.due_date}</span> : null}</div>)}</div>}
        <div className="field"><div className="field-label">Sentiment</div><div className="field-value">{memory.sentiment}</div></div>
        <div className="field"><div className="field-label">Confidence</div><div className="field-value">{Math.round(memory.confidence * 100)}% · {memory.evidenceVerified ? "evidence verified" : "quote not verified"}{(memory.confidence < 0.5 || !memory.evidenceVerified) && <span className="badge check-this">Check this</span>}</div></div>
        <Link className="button" href={`/capture?account=${account.id}`}>Add conversation</Link>
      </> : <><p className="subtitle">No buyer conversation has been captured yet. Discovery evidence is retained in the timeline.</p><Link className="button primary" href={`/capture?account=${account.id}`}>Add conversation</Link></>}
      </section>
      <section className="panel"><h2>Relationship timeline</h2>{timeline.length ? timeline.map((item) => <div className="timeline-item" key={item.key}><div className="field-label">{formatShortDate(item.date)} · {item.kind}</div><div className="field-value"><strong>{item.title}</strong>{item.body}</div></div>) : <p className="subtitle">Nothing on the timeline yet.</p>}</section>
      <aside className="panel"><h2>Next best action</h2>
        {rec ? <>
          <span className={`lane ${deal.lane.toLowerCase()}`}>{deal.lane}</span>{rec.status !== "new" && <span className="badge">{rec.status}{rec.status === "snoozed" && rec.snoozedUntil ? ` until ${formatShortDate(rec.snoozedUntil)}` : ""}</span>}
          <div className="headline">{rec.headline}</div><p className="why">{rec.explanation}</p>
          <div className="field"><div className="field-label">Score</div><div className="field-value">{deal.priorityScore} priority · {breakdown.match ?? deal.matchScore} match ({rec.effect.toLowerCase()}){breakdown.value !== undefined ? ` · ${breakdown.value} value` : ""}{breakdown.freshness !== undefined ? ` · ${breakdown.freshness} freshness` : ""}</div></div>
          <RecActions recommendationId={rec.id} defaultChannel={defaultChannel} showOpen={false} status={rec.status} />
        </> : memory && daysSilent !== null && daysSilent > 14 ? <>
          <p className="subtitle">No actionable signal yet, but it has been {daysSilent} days since the last touch.</p>
          <DraftPanel dealId={deal.id} defaultChannel={defaultChannel} />
        </> : <p className="subtitle">Keep watching. There is no actionable signal yet.</p>}
        <div className="field"><div className="field-label">Signals</div>{account.signals.length ? account.signals.map((signal) => <div className="field-value" key={signal.id}>{signal.title} <span className="badge">{PROVENANCE_LABEL[signal.provenance] ?? signal.provenance}</span></div>) : <div className="meta">No signals yet.</div>}</div>
      </aside>
    </div>
    <div className="ask-section"><AskBox title={`Ask about ${account.name}`} accountId={account.id} suggestions={["What has this account told us and promised?", "What is blocking this deal?", "What changed since we last spoke?"]} /></div>
  </div>;
}
