import { createHash } from "node:crypto";
import { fetchGreenhouseJobs, type BoardJob, type BoardResult } from "./greenhouse";
import { fetchLeverJobs } from "./lever";
import { AMBIGUOUS_NEWS_DOMAINS, fetchCompanyNews, type NewsSignalType } from "./news";
import { isLeadershipTitle, relevantRoles } from "./roles";

export { fetchGreenhouseJobs, normalizeGreenhouse } from "./greenhouse";
export type { BoardJob, BoardResult } from "./greenhouse";
export { fetchLeverJobs, normalizeLever } from "./lever";
export { AMBIGUOUS_NEWS_DOMAINS, classifyHeadline, fetchCompanyNews, filterCompanyNews, isProfilePage, parseRssItems, titleMentions } from "./news";
export { isLeadershipTitle, relevantRoles, DEFAULT_ROLE_KEYWORDS } from "./roles";
export { fetchJsonWithCache, fetchTextWithCache } from "./cache";

export type EvidenceProvenance = "live" | "cached";
export type SourceEvidence = {
  kind: "SIGNAL" | "FIT";
  /** Signal type for SIGNAL evidence (FUNDING, HIRING_RELEVANT, LEADERSHIP_CHANGE, EXPANSION, PRODUCT_LAUNCH); null for FIT. */
  signalType: SourceSignalType | null;
  title: string;
  excerpt: string;
  sourceName: string;
  sourceUrl: string;
  observedAt: Date;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: EvidenceProvenance;
  /** Stable key; equals the matching SourceSignal.dedupeKey for SIGNAL evidence. */
  dedupeKey: string;
};
export type SourceSignalType = "HIRING_RELEVANT" | NewsSignalType;
export type SourceSignal = { type: SourceSignalType; title: string; detail: string; sourceName: string; sourceUrl: string; occurredAt: Date; dedupeKey: string; provenance: EvidenceProvenance; /** Number of matching open roles (HIRING_RELEVANT only). */ roleCount?: number };
export type CompanyEvidence = { evidence: SourceEvidence[]; signals: SourceSignal[]; stale: boolean; errors: string[] };
export type EvidenceCompany = { name: string; domain: string; careersProvider: string; careersToken: string | null };

export function shortHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function latest(jobs: BoardJob[], fallback: Date) {
  const times = jobs.map((job) => job.updatedAt?.getTime() ?? 0).filter(Boolean);
  return times.length ? new Date(Math.max(...times)) : fallback;
}

function listTitles(titles: string[], max = 4) {
  const unique = [...new Set(titles)];
  return unique.slice(0, max).join("; ") + (unique.length > max ? `; +${unique.length - max} more` : "");
}

/** Pure: turn a fetched job board into evidence + signals. Exported for tests and the signal-check pipeline. */
export function boardEvidence(company: EvidenceCompany, provider: "greenhouse" | "lever", token: string, board: BoardResult, roleKeywords: string[]): Pick<CompanyEvidence, "evidence" | "signals"> {
  const provenance: EvidenceProvenance = board.stale ? "cached" : "live";
  const sourceName = provider === "greenhouse" ? "Greenhouse job board" : "Lever job board";
  const relevantTitles = new Set(relevantRoles(board.jobs.map((job) => job.title), roleKeywords));
  const relevant = board.jobs.filter((job) => relevantTitles.has(job.title));
  const evidence: SourceEvidence[] = [];
  const signals: SourceSignal[] = [];
  if (relevant.length) {
    const ids = relevant.map((job) => job.id).sort().join(",");
    const observedAt = latest(relevant, board.fetchedAt);
    const title = `Hiring ${relevant.length} relevant role${relevant.length === 1 ? "" : "s"}`;
    const detail = listTitles(relevant.map((job) => job.title));
    const sourceUrl = relevant.length === 1 ? relevant[0].url : board.boardUrl;
    const dedupeKey = `${provider}:${token}:${shortHash(ids)}`;
    evidence.push({ kind: "SIGNAL", signalType: "HIRING_RELEVANT", title, excerpt: detail, sourceName, sourceUrl, observedAt, confidence: relevant.length >= 2 ? "HIGH" : "MEDIUM", provenance, dedupeKey });
    signals.push({ type: "HIRING_RELEVANT", title: `${company.name}: ${title.toLowerCase()}`, detail, sourceName, sourceUrl, occurredAt: observedAt, dedupeKey, provenance, roleCount: relevant.length });
    const leaders = relevant.filter((job) => isLeadershipTitle(job.title));
    if (leaders.length) {
      const leaderIds = leaders.map((job) => job.id).sort().join(",");
      const leaderAt = latest(leaders, board.fetchedAt);
      const leaderTitle = `Recruiting ${leaders[0].title}`;
      const leaderKey = `${provider}:${token}:lead:${shortHash(leaderIds)}`;
      evidence.push({ kind: "SIGNAL", signalType: "LEADERSHIP_CHANGE", dedupeKey: leaderKey, title: leaderTitle, excerpt: `Open senior role${leaders.length > 1 ? "s" : ""}: ${listTitles(leaders.map((job) => job.title), 3)}. A new leader often re-evaluates tooling.`, sourceName, sourceUrl: leaders[0].url, observedAt: leaderAt, confidence: "MEDIUM", provenance });
      signals.push({ type: "LEADERSHIP_CHANGE", title: `${company.name}: ${leaderTitle}`, detail: listTitles(leaders.map((job) => job.title), 3), sourceName, sourceUrl: leaders[0].url, occurredAt: leaderAt, dedupeKey: leaderKey, provenance });
    }
  } else if (board.jobs.length) {
    evidence.push({ kind: "FIT", signalType: null, title: `${board.jobs.length} open roles, none in target functions`, excerpt: `Actively hiring (e.g. ${listTitles(board.jobs.map((job) => job.title), 3)}), but no roles match the target keywords.`, sourceName, sourceUrl: board.boardUrl, observedAt: latest(board.jobs, board.fetchedAt), confidence: "LOW", provenance, dedupeKey: `${provider}:${token}:fit` });
  }
  return { evidence, signals };
}

/**
 * Collect live evidence for one company from its public job board (Greenhouse/Lever) and Google News.
 * Never throws: source failures are reported in `errors`; `stale` is true when any source fell back to cache.
 * @param roleKeywords seller role keywords (e.g. ["security", "compliance", "platform"]) used to pick relevant job titles.
 */
export async function collectCompanyEvidence(company: EvidenceCompany, roleKeywords: string[], options: { includeNews?: boolean; maxNews?: number } = {}): Promise<CompanyEvidence> {
  const evidence: SourceEvidence[] = [];
  const signals: SourceSignal[] = [];
  const errors: string[] = [];
  let stale = false;
  const tasks: Promise<void>[] = [];
  const provider = company.careersProvider;
  const token = company.careersToken;
  if (token && (provider === "greenhouse" || provider === "lever")) {
    tasks.push((async () => {
      try {
        const board = provider === "greenhouse" ? await fetchGreenhouseJobs(token) : await fetchLeverJobs(token);
        stale ||= board.stale;
        const result = boardEvidence(company, provider, token, board, roleKeywords);
        evidence.push(...result.evidence);
        signals.push(...result.signals);
      } catch (error) {
        errors.push(`${provider}: ${error instanceof Error ? error.message : "failed"}`);
      }
    })());
  }
  if (options.includeNews !== false && !AMBIGUOUS_NEWS_DOMAINS.has(company.domain)) {
    tasks.push((async () => {
      try {
        const news = await fetchCompanyNews(company.name);
        stale ||= news.stale;
        const provenance: EvidenceProvenance = news.stale ? "cached" : "live";
        // Most recent headline per signal type (near-duplicate stories collapse), at most maxNews overall.
        const byType = new Map<string, (typeof news.items)[number]>();
        for (const item of [...news.items].sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0))) if (item.type && !byType.has(item.type)) byType.set(item.type, item);
        const typed = [...byType.values()].slice(0, options.maxNews ?? 3);
        for (const item of typed) {
          const type = item.type as NewsSignalType;
          const observedAt = item.pubDate ?? news.fetchedAt;
          const sourceName = item.source ? `Google News · ${item.source}` : "Google News";
          const dedupeKey = `news:${company.domain}:${shortHash(item.link)}`;
          evidence.push({ kind: "SIGNAL", signalType: type, dedupeKey, title: item.title, excerpt: `${type.replace("_", " ").toLowerCase()} headline${item.source ? ` reported by ${item.source}` : ""}.`, sourceName, sourceUrl: item.link, observedAt, confidence: type === "FUNDING" || type === "LEADERSHIP_CHANGE" ? "MEDIUM" : "LOW", provenance });
          signals.push({ type, title: item.title, detail: item.source ?? "Google News", sourceName, sourceUrl: item.link, occurredAt: observedAt, dedupeKey, provenance });
        }
      } catch (error) {
        errors.push(`news: ${error instanceof Error ? error.message : "failed"}`);
      }
    })());
  }
  await Promise.all(tasks);
  evidence.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  return { evidence, signals, stale, errors };
}
