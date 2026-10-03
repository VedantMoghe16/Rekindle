import Link from "next/link";
import { ArrowUpRight, MessageSquareText } from "lucide-react";
import { formatINR, formatShortDate } from "@/lib/format";

type DealCard = Awaited<ReturnType<typeof import("@/lib/services/brief").getBrief>>["revive"][number];

export function RecommendationCard({ deal }: { deal: DealCard }) {
  const recommendation = deal.recommendations[0];
  const signalId = recommendation ? JSON.parse(recommendation.signalIdsJson)[0] : null;
  const signal = deal.account.signals.find((item) => item.id === signalId) ?? deal.account.signals[0];
  if (!recommendation || !deal.memory || !signal) return null;
  return <article className="rec-card">
    <div className="rec-top">
      <div className="rec-company"><strong>{deal.account.name}</strong><div className="meta">{deal.account.industry} · {deal.account.city}</div></div>
      <strong>{formatINR(deal.valueInr)}</strong>
      <div className="score" title={`Match ${deal.matchScore}`}>{deal.priorityScore}</div>
      <span className="lane revive">REVIVE</span>
    </div>
    <div className="headline">{recommendation.headline}</div>
    <div className="evidence">
      <div className="evidence-block">
        <div className="evidence-label">They said · {formatShortDate(deal.memory.evidenceDate ?? deal.stalledAt!)} · conversation</div>
        <div className="quote">“{deal.memory.evidenceQuote}”</div>
      </div>
      <div className="arrow">↓</div>
      <div className="evidence-block changed">
        <div className="evidence-label">What changed · {formatShortDate(signal.occurredAt)} · {signal.provenance === "computed" ? "Computed" : "Demo data"}</div>
        <div>{signal.title}</div>
      </div>
    </div>
    <p className="why"><strong>Why:</strong> {recommendation.explanation} <span className="badge">{recommendation.effect === "REMOVES" ? "Removes objection" : "Weakens objection"}</span></p>
    <div className="card-actions"><button className="button primary"><MessageSquareText /> Generate draft</button><Link className="button" href={`/accounts/${deal.account.id}`}>Open account <ArrowUpRight /></Link><button className="button">Snooze 7d</button></div>
  </article>;
}
