import { kvGet, kvSet } from './kv';

export interface RepoCacheEntry {
  stars: number;
  forks: number;
  valid: boolean;
  manualOverride?: boolean;
}

export type RepoCacheMap = Record<string, RepoCacheEntry>;

const KV_KEY = 'repo_cache_map';

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

/**
 * Log-scaled project-quality weight for a single merged PR, based on the
 * repo's stars and forks. Log-scale is deliberate: a linear weight would let
 * one PR into a huge project outweigh dozens of honest contributions
 * elsewhere, which makes the ranking worse, not better. This keeps the range
 * bounded — 1 for an unknown/tiny repo (identical to today's plain PR count)
 * up to roughly 6 for a very large, well-known project — so quantity still
 * matters; it's just no longer the only thing that does.
 *
 * Forks count for 3x a star each: a fork means someone actually reused the
 * code, a stronger signal than a star click.
 */
export function computeRepoWeight(stars: number, forks: number): number {
  const signal = Math.max(0, stars) + 3 * Math.max(0, forks);
  return 1 + Math.log10(signal + 1);
}
