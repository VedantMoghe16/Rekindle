import { fetchJsonWithCache } from "./cache";

export type BoardJob = { id: string; title: string; location: string | null; url: string; updatedAt: Date | null };
export type BoardResult = { jobs: BoardJob[]; stale: boolean; fetchedAt: Date; boardUrl: string };

type GreenhouseResponse = { jobs?: { id: number; title: string; location?: { name?: string } | null; absolute_url?: string; updated_at?: string }[] };

export function greenhouseBoardUrl(token: string) {
  return `https://job-boards.greenhouse.io/${token}`;
}

/** Normalize a Greenhouse board API payload. Pure; exported for tests. */
export function normalizeGreenhouse(token: string, body: GreenhouseResponse): BoardJob[] {
  return (body.jobs ?? []).map((job) => ({
    id: String(job.id),
    title: job.title.trim(),
    location: job.location?.name?.trim() || null,
    url: job.absolute_url || `${greenhouseBoardUrl(token)}/jobs/${job.id}`,
    updatedAt: job.updated_at ? new Date(job.updated_at) : null,
  }));
}

/** Fetch open jobs from a public Greenhouse board (cached in SourceCache, stale fallback). */
export async function fetchGreenhouseJobs(token: string, ttlMs?: number): Promise<BoardResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=false`;
  const result = await fetchJsonWithCache<GreenhouseResponse>(`greenhouse:${token}`, url, ttlMs);
  return { jobs: normalizeGreenhouse(token, result.data), stale: result.stale, fetchedAt: result.fetchedAt, boardUrl: greenhouseBoardUrl(token) };
}
