import { kvGet, kvSet } from './kv';
import { getGitHubHeaders } from './github';
import { readSummaryCache } from './summary-cache';
import { readProfileCache } from './profile-cache';

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

const KV_KEY = 'org_cache_map';

export async function getOrgCache(): Promise<OrgCacheMap> {
  const cached = await kvGet<OrgCacheMap>(KV_KEY);
  return cached || {};
}

export async function saveOrgCache(map: OrgCacheMap): Promise<void> {
  await kvSet(KV_KEY, map);
}

/**
 * Validates whether a given query or username represents a legitimate GitHub Organization.
 * Uses KV caching to avoid hitting GitHub API rate limits.
 */
export async function resolveOrganization(
  query: string,
): Promise<OrgCacheEntry | null> {
  const clean = query.trim().replace(/^@/, '');
  if (!clean || clean.length < 2 || clean.includes(' ') || clean.includes('/')) {
    return null;
  }

  const lower = clean.toLowerCase();
  const cacheMap = await getOrgCache();

  // Check cache by login or name
  const existingKey = Object.keys(cacheMap).find(
    (k) => k.toLowerCase() === lower || cacheMap[k]?.name?.toLowerCase() === lower,
  );

  if (existingKey) {
    const entry = cacheMap[existingKey];
    if (entry) {
      // If checked within 7 days, trust cache
      const ageMs = Date.now() - new Date(entry.checkedAt).getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        return entry.isOrganization ? entry : null;
      }
    }
  }

  // Not in cache or stale: query GitHub Organization API
  try {
    const headers = await getGitHubHeaders();
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(clean)}`, {
      headers,
      next: { revalidate: 86400 },
    });

    if (res.ok) {
      const data = await res.json();
      const entry: OrgCacheEntry = {
        login: data.login || clean,
        name: data.name || data.login || clean,
        type: 'Organization',
        isOrganization: data.type === 'Organization' || !data.type,
        publicRepos: data.public_repos ?? 0,
        description: data.description ?? undefined,
        avatarUrl: data.avatar_url ?? undefined,
        checkedAt: new Date().toISOString(),
      };

      cacheMap[entry.login.toLowerCase()] = entry;
      await saveOrgCache(cacheMap);
      return entry.isOrganization ? entry : null;
    } else if (res.status === 404) {
      // 404 on /orgs/ means it is not a GitHub organization (might be a user account or non-existent)
      const negativeEntry: OrgCacheEntry = {
        login: clean,
        type: 'User',
        isOrganization: false,
        checkedAt: new Date().toISOString(),
      };
      cacheMap[lower] = negativeEntry;
      await saveOrgCache(cacheMap);
      return null;
    }
  } catch (err) {
    console.error(`Failed to resolve GitHub organization for "${clean}":`, err);
  }

  return null;
}

export interface OrgSuggestion {
  login: string;
  name?: string;
  avatarUrl?: string;
  contributorsCount: number;
  mergedPRs: number;
  score: number;
}

export interface ContributorSuggestion {
  login: string;
  name?: string;
  avatarUrl?: string;
  campus?: string;
  year?: string;
  mergedPRs: number;
  score: number;
}

export interface SearchSuggestionsResult {
  organizations: OrgSuggestion[];
  contributors: ContributorSuggestion[];
}

/**
 * Computes a match score (0-100) between query and target string.
 * Supports prefix matching, substring matching, and fuzzy subsequence / typo matching.
 */
export function fuzzyMatchScore(rawQuery: string, rawTarget: string): number {
  const query = rawQuery.toLowerCase().trim().replace(/^@/, '');
  const target = rawTarget.toLowerCase().trim().replace(/^@/, '');

  if (!query || !target) return 0;
  if (target === query) return 100;
  if (target.startsWith(query)) return 90;
  if (target.includes(query)) return 75;

  // For very short queries (< 2 chars), only prefix / exact matches are valid
  if (query.length < 2) return 0;

  // Subsequence matching (characters appear in order)
  let qIdx = 0;
  let tIdx = 0;
  let matches = 0;
  while (qIdx < query.length && tIdx < target.length) {
    if (query[qIdx] === target[tIdx]) {
      matches++;
      qIdx++;
    }
    tIdx++;
  }

  if (matches === query.length) {
    // Score based on compactness (ratio of query length to span in target)
    const span = tIdx;
    const compactness = query.length / span;
    return Math.round(50 + 15 * compactness);
  }

  // Simple edit distance for typo tolerance (e.g. apch -> apache) if query is at least 3 chars
  if (query.length >= 3 && Math.abs(query.length - target.length) <= 3) {
    const dist = levenshteinDistance(query, target);
    if (dist <= 2) {
      return Math.max(30, 60 - dist * 15);
    }
  }

  return 0;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function repoFromUrl(url: string): string {
  const m = url.match(/repos\/([^/]+\/[^/]+)/);
  return m ? m[1] : url;
}

/**
 * Searches local cached organizations (from org_cache_map and contributor PR repository owners)
 * and student contributors for autocomplete suggestions.
 * ZERO live GitHub API requests are made during this operation.
 */
export async function getSearchSuggestions(
  query: string,
  limit = 5,
): Promise<SearchSuggestionsResult> {
  const clean = query.trim().replace(/^@/, '');
  if (!clean) {
    return { organizations: [], contributors: [] };
  }

  // 1. Gather all organization candidates strictly from verified org_cache_map entries
  // Explicitly excludes user accounts (type === 'User' or isOrganization === false) and unverified accounts.
  const orgMap = await getOrgCache();
  const summaryCache = await readSummaryCache('all');
  const allSummaries = summaryCache?.summaries || [];

  interface OrgAgg {
    login: string;
    name?: string;
    avatarUrl?: string;
    contributors: Set<string>;
    mergedPRs: number;
  }

  const orgAggs = new Map<string, OrgAgg>();

  // (a) Seed only verified organizations from org_cache_map
  for (const entry of Object.values(orgMap)) {
    if (entry && entry.isOrganization === true && entry.type === 'Organization') {
      const lower = entry.login.toLowerCase();
      if (!orgAggs.has(lower)) {
        orgAggs.set(lower, {
          login: entry.login,
          name: entry.name || entry.login,
          avatarUrl: entry.avatarUrl,
          contributors: new Set<string>(),
          mergedPRs: 0,
        });
      }
    }
  }

  // (b) Discover and enrich contribution counts from student PR data ONLY for verified organizations.
  // Unverified repository owners are NEVER assumed to be organizations.
  await Promise.all(
    allSummaries.map(async (student) => {
      try {
        const cachedProfile = await readProfileCache(student.profile.login);
        const prs = cachedProfile?.prs || [];
        for (const pr of prs) {
          if (!pr.repository_url) continue;
          const repo = repoFromUrl(pr.repository_url);
          const owner = repo.split('/')[0]?.trim();
          if (!owner || owner.length < 2) continue;
          const lowerOwner = owner.toLowerCase();

          // Only accumulate stats if this owner is confirmed to be an organization
          const agg = orgAggs.get(lowerOwner);
          if (agg) {
            agg.contributors.add(student.profile.login);
            if (pr.pull_request?.merged_at) {
              agg.mergedPRs++;
            }
          }
        }
      } catch {
        // Ignore individual profile read errors
      }
    }),
  );

  // 2. Score and rank Organization suggestions
  const orgSuggestions: OrgSuggestion[] = [];
  for (const agg of orgAggs.values()) {
    const loginScore = fuzzyMatchScore(clean, agg.login);
    const nameScore = agg.name ? fuzzyMatchScore(clean, agg.name) : 0;
    const bestScore = Math.max(loginScore, nameScore);

    if (bestScore > 0) {
      orgSuggestions.push({
        login: agg.login,
        name: agg.name || agg.login,
        avatarUrl: agg.avatarUrl,
        contributorsCount: agg.contributors.size,
        mergedPRs: agg.mergedPRs,
        score: bestScore,
      });
    }
  }

  orgSuggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.mergedPRs !== a.mergedPRs) return b.mergedPRs - a.mergedPRs;
    if (b.contributorsCount !== a.contributorsCount) return b.contributorsCount - a.contributorsCount;
    return a.login.localeCompare(b.login);
  });

  // 3. Score and rank Contributor suggestions
  const contributorSuggestions: ContributorSuggestion[] = [];
  for (const student of allSummaries) {
    const loginScore = fuzzyMatchScore(clean, student.profile.login);
    const nameScore = student.profile.name ? fuzzyMatchScore(clean, student.profile.name) : 0;
    const bestScore = Math.max(loginScore, nameScore);

    if (bestScore > 0) {
      contributorSuggestions.push({
        login: student.profile.login,
        name: student.profile.name ?? undefined,
        avatarUrl: student.profile.avatar_url,
        campus: student.campus,
        year: student.year,
        mergedPRs: student.mergedPRs,
        score: bestScore,
      });
    }
  }

  contributorSuggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.mergedPRs !== a.mergedPRs) return b.mergedPRs - a.mergedPRs;
    return a.login.localeCompare(b.login);
  });

  return {
    organizations: orgSuggestions.slice(0, limit),
    contributors: contributorSuggestions.slice(0, limit),
  };
}
