import type { StudentSummary } from './github';
import { kvGet, kvSet } from './kv';

/** Minimum gap between public refreshes (5 minutes) */
export const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export interface SummaryCache {
  cachedAt: string; // ISO timestamp
  summaries: StudentSummary[];
}

function getCacheKey(period = 'all'): string {
  return `summary_cache:${period || 'all'}`;
}

/* Why this exists: summary_cache:all is a ~3.3MB blob, and every page render
   used to fetch the whole thing from Upstash. At ~423KB average per command
   that is what exhausted the 10GB/month bandwidth allowance and got the
   database suspended -- the command count was never the binding limit.

   Holding it in process memory for a minute makes read bandwidth scale with
   TIME rather than TRAFFIC: one fetch per key per minute per pod, however many
   people are browsing. Each pod keeps its own copy, which is fine -- the data
   is already a cache, and a minute of staleness is far less than the 15-minute
   refresh interval that produces it.

   Writers must NOT share this object: both refresh routes mutate
   `existingCache.summaries` in place before writing it back, and handing them
   the cached instance would let a half-finished patch become visible to
   readers (or survive a failed write). They pass { bypassMemory: true }. */
const MEMORY_TTL_MS = 60_000;
const memory = new Map<string, { value: SummaryCache; expiresAt: number }>();

/** Escape hatch: set SUMMARY_CACHE_MEMORY_TTL_MS=0 to disable in-process caching. */
function memoryTtlMs(): number {
  const raw = process.env.SUMMARY_CACHE_MEMORY_TTL_MS;
  if (raw === undefined) return MEMORY_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : MEMORY_TTL_MS;
}

export async function readSummaryCache(
  period = 'all',
  options: { bypassMemory?: boolean } = {},
): Promise<SummaryCache | null> {
  const key = getCacheKey(period);
  const ttl = memoryTtlMs();

  if (!options.bypassMemory && ttl > 0) {
    const hit = memory.get(key);
    if (hit && Date.now() < hit.expiresAt) return hit.value;
  }

  const value = await kvGet<SummaryCache>(key);
  // Only cache on the read path. A bypassMemory caller is about to mutate what
  // it gets back, so storing that instance would publish a half-finished patch
  // to every reader -- and keep it there if the write never lands.
  if (value && ttl > 0 && !options.bypassMemory) {
    memory.set(key, { value, expiresAt: Date.now() + ttl });
  }
  return value;
}

/** Drops the in-process copy so the next read goes to KV. */
export function forgetSummaryCacheMemory(period?: string): void {
  if (period === undefined) memory.clear();
  else memory.delete(getCacheKey(period));
}

/** The store did not accept the summary cache; nothing was changed. */
export class SummaryCacheWriteError extends Error {
  constructor(period: string) {
    super(`The summary cache for "${period}" could not be written to the store; the previous cache is still in place.`);
    this.name = 'SummaryCacheWriteError';
  }
}

export async function writeSummaryCache(summaries: StudentSummary[], period = 'all'): Promise<void> {
  const cache: SummaryCache = {
    cachedAt: new Date().toISOString(),
    summaries,
  };
  // Store summary caches permanently. They are ONLY updated incrementally
  // by background jobs, preventing the leaderboard from ever dropping to zero.
  //
  // A write that did not land must not look like one that did: the "all"
  // rebuild once reported ok while the proxy had closed the socket on the
  // 3.5 MB SET, and the leaderboard kept pre-gate totals for hours.
  const stored = await kvSet(getCacheKey(period), cache);
  if (!stored) {
    throw new SummaryCacheWriteError(period);
  }
  // Drop the in-process copy rather than populating it with `summaries`: that
  // array belongs to the caller and the refresh routes keep mutating theirs.
  // The next read re-fetches once and caches a parsed copy nobody else holds.
  memory.delete(getCacheKey(period));
}

/** Returns true if the cache is younger than the cooldown window */
export function isCacheFresh(cache: SummaryCache): boolean {
  const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
  return ageMs < REFRESH_COOLDOWN_MS;
}

/** Stamps cachedAt as epoch so all predefined caches are immediately stale (used after flagging) */
/** The cachedAt value that marks a cache as invalidated and due a full rebuild. */
export const INVALIDATED_AT = '1970-01-01T00:00:00.000Z';

export async function invalidateSummaryCache(): Promise<void> {
  const periods = ['all', 'week', 'month', '1day', '2months', '3months', '6months', 'year'];
  forgetSummaryCacheMemory();
  for (const period of periods) {
    try {
      const cache = await readSummaryCache(period, { bypassMemory: true });
      if (cache) {
        cache.cachedAt = INVALIDATED_AT;
        await writeSummaryCache(cache.summaries, period);
      }
    } catch (err) {
      // A missing cache is nothing to invalidate; a write failure is worth a
      // line, because that period will keep serving pre-change totals.
      console.warn(`[summary-cache] could not invalidate ${period}:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Keeps only summaries whose login is on the roster. A period cache is patched
 * in place by the incremental refresh and never rebuilt on its own ("all" in
 * particular), so a student removed or renamed on the roster lingered in it —
 * and the Students figure, which was the array length, drifted apart between
 * periods (2,193 / 2,100 / 2,088 for the same roster). Pure; cheap.
 */
export function pruneToRoster<T extends { profile: { login: string } }>(
  summaries: T[],
  roster: ReadonlyArray<{ github: string }>
): T[] {
  const allowed = new Set(roster.map((s) => s.github.toLowerCase()));
  return summaries.filter((s) => allowed.has(s.profile.login.toLowerCase()));
}
