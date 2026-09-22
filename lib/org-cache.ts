import { kvGet, kvSet } from './kv';
import type { StudentSummary } from './github';

export interface OrgCacheEntry {
  login: string;
  name?: string;
  type: 'Organization' | 'User';
  isOrganization: boolean;
  publicRepos?: number;
  description?: string;
  avatarUrl?: string;
  checkedAt: string;
}

export type OrgCacheMap = Record<string, OrgCacheEntry>;

export interface OrgFilterOption {
  login: string;
  name: string;
  mergedPRs: number;
  contributorsCount: number;
}

const KV_KEY = 'org_cache_map';

export async function getOrgCache(): Promise<OrgCacheMap> {
  const cached = await kvGet<OrgCacheMap>(KV_KEY);
  return cached || {};
}

export async function saveOrgCache(map: OrgCacheMap): Promise<void> {
  await kvSet(KV_KEY, map);
}

/**
 * Returns the verified, ranked organization options for the leaderboard filter.
 * Only includes legitimate GitHub organizations where contributors have merged PRs.
 * Ranked by activity in this dataset:
 * 1. Number of merged PRs (descending)
 * 2. Number of contributors (descending)
 * 3. Alphabetical
 */
export async function getOrgFilterOptions(
  summaries: StudentSummary[],
): Promise<OrgFilterOption[]> {
  const orgCache = await getOrgCache();
  const orgMap = new Map<string, { login: string; name: string; mergedPRs: number; contributorsCount: number }>();

  for (const s of summaries) {
    if (!s.organizations || s.organizations.length === 0) continue;
    for (const org of s.organizations) {
      const lower = org.toLowerCase();
      const meta = orgCache[org];

      // If we have an entry in orgCache and it is explicitly NOT an organization, skip it
      if (meta && !meta.isOrganization) continue;

      if (!orgMap.has(lower)) {
        orgMap.set(lower, {
          login: org,
          name: meta?.name || org,
          mergedPRs: 0,
          contributorsCount: 0,
        });
      }
      const entry = orgMap.get(lower)!;
      entry.contributorsCount++;
      // Increment merged PR count if this contributor has merged PRs
      entry.mergedPRs += (s.mergedPRs > 0 ? 1 : 0);
    }
  }

  const options = Array.from(orgMap.values());

  options.sort((a, b) => {
    if (b.contributorsCount !== a.contributorsCount) {
      return b.contributorsCount - a.contributorsCount;
    }
    if (b.mergedPRs !== a.mergedPRs) {
      return b.mergedPRs - a.mergedPRs;
    }
    return a.name.localeCompare(b.name);
  });

  return options;
}
