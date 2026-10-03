import { formatINR, formatShortDate } from "@/lib/format";
import { RecActions } from "@/components/brief/rec-actions";

type DealCard = Awaited<ReturnType<typeof import("@/lib/services/brief").getBrief>>["revive"][number];

export const PROVENANCE_LABEL: Record<string, string> = { live: "Live", cached: "Cached", computed: "Computed", demo: "Demo data", simulated: "Simulated" };
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", call: "Call", meeting: "Meeting", note: "Note" };

export function RecommendationCard({ deal }: { deal: DealCard }) {
  const recommendation = deal.recommendations[0];
  const signalId = recommendation ? JSON.parse(recommendation.signalIdsJson)[0] : null;
  const signal = deal.account.signals.find((item) => item.id === signalId) ?? deal.account.signals[0];
  if (!recommendation || !deal.memory || !signal) return null;
  const lastChannel = deal.interactions?.[0]?.channel;
  const breakdown = JSON.parse(recommendation.scoreBreakdownJson || "{}") as { match?: number; value?: number; freshness?: number };
  const more = deal.account.signals.filter((item) => item.id !== signal.id && (!item.dealId || item.dealId === deal.id)).length;
  return <article className="rec-card">
    <div className="rec-top">
      <div className="rec-company"><strong>{deal.account.name}</strong><div className="meta">{deal.account.industry} · {deal.account.city}</div></div>
      <strong>{formatINR(deal.valueInr)}</strong>
      <div className="score" title={`Match ${breakdown.match ?? deal.matchScore} · value ${breakdown.value ?? "–"} · freshness ${breakdown.freshness ?? "–"}`}>{deal.priorityScore}</div>
      <span className={`lane ${deal.lane.toLowerCase()}`}>{deal.lane}</span>
    </div>
    <div className="headline">{recommendation.headline}</div>
    <div className="evidence">
      <div className="evidence-block">
        <div className="evidence-label">They said · {formatShortDate(deal.memory.evidenceDate ?? deal.stalledAt!)}{lastChannel ? ` · ${CHANNEL[lastChannel] ?? lastChannel}` : ""}{deal.memory.evidenceSpeaker ? ` · ${deal.memory.evidenceSpeaker}` : ""}</div>
        <div className="quote">“{deal.memory.evidenceQuote}”</div>
      </div>
      <div className="arrow">↓</div>
      <div className="evidence-block changed">
        <div className="evidence-label">What changed · {formatShortDate(signal.occurredAt)} · {signal.sourceName} · {PROVENANCE_LABEL[signal.provenance] ?? signal.provenance}</div>
        <div>{signal.title}{signal.sourceUrl && <> <a href={signal.sourceUrl} target="_blank" rel="noreferrer">source ↗</a></>}</div>
        {more > 0 && <div className="meta">+{more} more signal{more === 1 ? "" : "s"}</div>}
      </div>
    </div>
    <p className="why"><strong>Why:</strong> {recommendation.explanation} <span className="badge">{recommendation.effect === "REMOVES" ? "Removes objection" : recommendation.effect === "WEAKENS" ? "Weakens objection" : "Follow-up"}</span>{recommendation.status === "drafted" && <span className="badge">Drafted</span>}</p>
    <RecActions recommendationId={recommendation.id} accountId={deal.account.id} defaultChannel={lastChannel === "email" ? "email" : "whatsapp"} status={recommendation.status} />
  </article>;
}
