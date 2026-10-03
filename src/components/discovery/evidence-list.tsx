import { ExternalLink } from "lucide-react";

export type EvidenceRow = { id: string; kind: string; title: string; excerpt: string; sourceName: string; sourceUrl: string | null; observedAt: string | Date; provenance: string };

const LABELS: Record<string, string> = { live: "Live", cached: "Cached", demo: "Demo" };

export function ProvenanceBadge({ provenance }: { provenance: string }) {
  const key = LABELS[provenance] ? provenance : "demo";
  return <span className={`badge lead-prov lead-prov-${key}${key === "demo" ? " demo" : ""}`}>{LABELS[key]}</span>;
}

export function formatEvidenceDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Date unknown";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}

export function EvidenceList({ evidence, limit = 3 }: { evidence: EvidenceRow[]; limit?: number }) {
  if (!evidence.length) return <div className="evidence-empty">Timing: Unknown · no public job-board or news evidence found</div>;
  return <ul className="evidence-list">{evidence.slice(0, limit).map((item) => <li key={item.id} className={`evidence-row ${item.kind === "SIGNAL" ? "signal" : "fit"}`}>
    <div className="evidence-title">{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.title}<ExternalLink /></a> : item.title}</div>
    {item.excerpt && <p>{item.excerpt}</p>}
    <div className="evidence-meta"><span>{item.sourceName}</span><span>·</span><span>{formatEvidenceDate(item.observedAt)}</span><ProvenanceBadge provenance={item.provenance} /></div>
  </li>)}{evidence.length > limit && <li className="evidence-more">+{evidence.length - limit} more evidence</li>}</ul>;
}

export function candidateProvenance(candidate: { isDemo: boolean; evidence: { provenance: string }[] }) {
  if (candidate.isDemo) return "demo";
  if (candidate.evidence.some((item) => item.provenance === "live")) return "live";
  if (candidate.evidence.some((item) => item.provenance === "cached")) return "cached";
  return "none";
}
