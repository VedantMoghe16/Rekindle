import { fetchJsonWithCache } from "./cache";
import type { BoardJob, BoardResult } from "./greenhouse";

type LeverPosting = { id: string; text: string; hostedUrl?: string; createdAt?: number; categories?: { location?: string; allLocations?: string[] } };

export function leverBoardUrl(token: string) {
  return `https://jobs.lever.co/${token}`;
}

/** Normalize a Lever postings payload. Pure; exported for tests. */
export function normalizeLever(token: string, body: unknown): BoardJob[] {
  if (!Array.isArray(body)) return [];
  return (body as LeverPosting[]).map((posting) => ({
    id: posting.id,
    title: posting.text.trim(),
    location: posting.categories?.location?.trim() || null,
    url: posting.hostedUrl || `${leverBoardUrl(token)}/${posting.id}`,
    updatedAt: posting.createdAt ? new Date(posting.createdAt) : null,
  }));
}

/** Fetch open postings from a public Lever board (cached in SourceCache, stale fallback). */
export async function fetchLeverJobs(token: string, ttlMs?: number): Promise<BoardResult> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
  const result = await fetchJsonWithCache<unknown>(`lever:${token}`, url, ttlMs);
  return { jobs: normalizeLever(token, result.data), stale: result.stale, fetchedAt: result.fetchedAt, boardUrl: leverBoardUrl(token) };
}
