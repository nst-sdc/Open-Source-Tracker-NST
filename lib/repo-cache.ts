import { kvGet, kvSet } from './kv';
import type { RepoSignals } from './repo-score';
import { REPO_SCHEMA_VERSION } from './repo-score';

export interface RepoCacheEntry {
  /** Absent on entries written before the #4 scoring overhaul. Entries whose
   *  version doesn't match REPO_SCHEMA_VERSION are re-fetched by
   *  validateNewRepos on the next refresh; until then they score through
   *  legacyMultiplier() (stars-only) rather than silently degrading to a
   *  constant — see repo-score.ts. */
  schemaVersion?: number;
  stars: number;
  forks: number;
  valid: boolean;
  manualOverride?: boolean;
  /** Full signal set for the #4 scorer. Present iff schemaVersion is current. */
  signals?: RepoSignals;
  /** ISO timestamp of the last successful signal fetch. Absent on entries
   *  written before re-checking existed — those are treated as stale so they
   *  pick up a timestamp on the next refresh. */
  checkedAt?: string;
}

export type RepoCacheMap = Record<string, RepoCacheEntry>;

const KV_KEY = 'repo_cache_map';

/**
 * How long a repo's signals are trusted before they are fetched again.
 *
 * Without this the validity verdict a repo received the first time it was ever
 * seen was the verdict it kept forever, which fails in both directions: a repo
 * that grows past the threshold stays excluded and its contributors never get
 * credit, and a repo that is later archived or turns into a fork farm keeps
 * scoring. A filter that only runs once decays.
 *
 * Seven days rather than something shorter because the underlying signals —
 * stars, forks, watchers, archived state — move slowly, so a shorter window
 * would churn scores without changing many verdicts. The cost is small either
 * way: a repo is only re-fetched when a student who contributed to it comes up
 * in the daily profile rotation, so the work spreads itself across the cycle
 * rather than landing as a single batch.
 */
export const REPO_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

/** True when this entry needs a (re-)fetch: never seen, written by an older
 *  schema, or last checked longer ago than REPO_RECHECK_MS. manualOverride
 *  entries are refreshed too — the override pins `valid`, not the signals. */
export function isEntryStale(entry: RepoCacheEntry | undefined, nowMs: number = Date.now()): boolean {
  if (!entry || entry.schemaVersion !== REPO_SCHEMA_VERSION || !entry.signals) return true;
  if (!entry.checkedAt) return true;

  const checkedMs = new Date(entry.checkedAt).getTime();
  // A malformed timestamp is worth one re-fetch to replace with a good one.
  if (Number.isNaN(checkedMs)) return true;
  // A timestamp in the future (clock skew between writers) is not treated as
  // stale; it simply ages into the window.
  return nowMs - checkedMs >= REPO_RECHECK_MS;
}

/**
 * Get the full map of cached repositories.
 */
export async function getRepoCache(): Promise<RepoCacheMap> {
  const cached = await kvGet<RepoCacheMap>(KV_KEY);
  return cached || {};
}

/**
 * Save the updated repo cache back to KV.
 */
export async function saveRepoCache(map: RepoCacheMap): Promise<void> {
  // No TTL on the key itself: individual entries carry `checkedAt` and expire
  // one at a time through isEntryStale, so the map as a whole always survives.
  await kvSet(KV_KEY, map);
}

/** Minimum valid merged PRs before a student's average project-impact score
 * (StudentSummary.avgScore) is shown at all. Below this, one merge into a
 * huge repo would read as a perfect average — noise, not a signal of
 * consistently choosing impactful projects. */
export const MIN_PRS_FOR_AVG_SCORE = 5;
