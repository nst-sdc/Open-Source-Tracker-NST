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
}

export type RepoCacheMap = Record<string, RepoCacheEntry>;

const KV_KEY = 'repo_cache_map';

/** True when this entry needs a (re-)fetch: never seen, or written by an older
 *  schema. manualOverride entries are refreshed too — the override pins
 *  `valid`, not the signals. */
export function isEntryStale(entry: RepoCacheEntry | undefined): boolean {
  return !entry || entry.schemaVersion !== REPO_SCHEMA_VERSION || !entry.signals;
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
  // Store permanently
  await kvSet(KV_KEY, map);
}

/** Minimum valid merged PRs before a student's average project-impact score
 * (StudentSummary.avgScore) is shown at all. Below this, one merge into a
 * huge repo would read as a perfect average — noise, not a signal of
 * consistently choosing impactful projects. */
export const MIN_PRS_FOR_AVG_SCORE = 5;
