import { db } from "@/lib/db";

export type CachedFetch<T> = { data: T; stale: boolean; fetchedAt: Date };

export function sourceTimeoutMs(): number {
  const value = Number(process.env.SOURCE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 8000;
}

async function readCache(key: string) {
  try {
    return await db.sourceCache.findUnique({ where: { key } });
  } catch {
    return null;
  }
}

async function writeCache(key: string, response: string) {
  try {
    await db.sourceCache.upsert({ where: { key }, create: { key, response, fetchedAt: new Date() }, update: { response, fetchedAt: new Date() } });
  } catch {
    // cache write failures never block a live result
  }
}

async function fetchWithCache<T>(key: string, url: string, ttlMs: number, parse: (response: Response) => Promise<string>, decode: (raw: string) => T): Promise<CachedFetch<T>> {
  const cached = await readCache(key);
  if (cached && Date.now() - cached.fetchedAt.getTime() < ttlMs) return { data: decode(cached.response), stale: false, fetchedAt: cached.fetchedAt };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(sourceTimeoutMs()), headers: { "user-agent": "Rekindle/0.1 (+lead research)", accept: "*/*" } });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const raw = await parse(response);
    const data = decode(raw);
    await writeCache(key, raw);
    return { data, stale: false, fetchedAt: new Date() };
  } catch (error) {
    if (cached) return { data: decode(cached.response), stale: true, fetchedAt: cached.fetchedAt };
    throw error;
  }
}

/**
 * Fetch JSON with a durable SourceCache fallback. A fresh cache hit (younger than ttlMs) skips the network.
 * On timeout/error returns the last cached copy with `stale: true`, or throws when nothing is cached.
 */
export function fetchJsonWithCache<T = unknown>(key: string, url: string, ttlMs = 6 * 3_600_000): Promise<CachedFetch<T>> {
  return fetchWithCache(key, url, ttlMs, (response) => response.text(), (raw) => JSON.parse(raw) as T);
}

/** Text variant of fetchJsonWithCache (used for RSS). */
export function fetchTextWithCache(key: string, url: string, ttlMs = 6 * 3_600_000): Promise<CachedFetch<string>> {
  return fetchWithCache(key, url, ttlMs, (response) => response.text(), (raw) => raw);
}
