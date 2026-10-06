import { kvGet, kvSet } from './kv';
import type { ProfileCacheEntry } from './profile-cache';

/**
 * Which students have contributed to which organisation, precomputed.
 *
 * The question the org filter asks -- "who contributed to apache?" -- is
 * already answered by data we hold: every PR carries a repository_url, and the
 * owner falls straight out of it. Deriving that per request meant opening all
 * ~1,890 profile caches on every keystroke (~11,000 KV commands to type one
 * org name), which is what exhausted Upstash's bandwidth allowance and
 * suspended the production database.
 *
 * So it is derived once per refresh instead, inside the loop that is already
 * holding each student's PRs in memory: no extra GitHub calls, no extra KV
 * reads. Building it there also fixes the bootstrap problem -- the previous
 * org map was only ever written when someone already had `?org=` in the URL,
 * which could only come from clicking a suggestion, which required the map to
 * be populated. On a fresh deploy it stayed empty forever.
 *
 * `contributors` holds merged-PR counts per student so the org view can rank
 * by contribution to THAT org rather than by global leaderboard position.
 */
export interface OrgIndexEntry {
  login: string;
  contributors: Record<string, number>;
  mergedPRs: number;
}

export type OrgIndex = Record<string, OrgIndexEntry>;

const KV_KEY = 'org_index';

export async function readOrgIndex(): Promise<OrgIndex> {
  return (await kvGet<OrgIndex>(KV_KEY)) || {};
}

export async function writeOrgIndex(index: OrgIndex): Promise<void> {
  await kvSet(KV_KEY, index);
}

function ownerOf(repositoryUrl: string | undefined): string | null {
  if (!repositoryUrl) return null;
  const repo = repositoryUrl.replace('https://api.github.com/repos/', '');
  const owner = repo.split('/')[0]?.trim();
  // Single-character owners are real on GitHub but are far more often a
  // malformed URL, and they pollute autocomplete; the previous implementation
  // skipped them too.
  return owner && owner.length >= 2 ? owner : null;
}

/**
 * Folds one student's merged PRs into the index. Call once per student while
 * their profile is already in hand; `index` is mutated.
 */
export interface IndexFilters {
  /** `${owner}/${repo}#${number}` of PRs an admin has flagged as junk. */
  flaggedPRIds?: Set<string>;
  /** Repos that failed star/activity validation; their PRs do not count. */
  isRepoValid?: (repoFullName: string) => boolean;
}

export function indexStudentContributions(
  index: OrgIndex,
  login: string,
  profile: Pick<ProfileCacheEntry, 'prs'>,
  filters: IndexFilters = {},
): void {
  // Keyed lowercased, like the index itself: GitHub preserves owner casing in
  // the API URL but treats it case-insensitively, so the same organisation can
  // arrive spelled differently across PRs. Keying on raw casing silently split
  // one org into two and, on re-index, dropped the student from it entirely.
  const perOwner = new Map<string, { login: string; count: number }>();

  for (const pr of profile.prs ?? []) {
    if (!pr.pull_request?.merged_at) continue;
    if (!pr.repository_url) continue;
    const repo = pr.repository_url.replace('https://api.github.com/repos/', '');

    // Count only what the org page will actually display. Without this the
    // dropdown advertised numbers the page then contradicted -- nst-sdc read
    // "79 contributors" and listed 7, because almost all of those PRs are
    // self-merges into the students' own org and are filtered on render.
    if (filters.flaggedPRIds?.has(`${repo}#${pr.number}`)) continue;
    if (filters.isRepoValid && !filters.isRepoValid(repo)) continue;

    const owner = ownerOf(pr.repository_url);
    if (!owner) continue;
    const key = owner.toLowerCase();
    const seen = perOwner.get(key);
    if (seen) seen.count += 1;
    else perOwner.set(key, { login: owner, count: 1 });
  }

  for (const [key, { login: owner, count }] of perOwner) {
    const entry = (index[key] ??= { login: owner, contributors: {}, mergedPRs: 0 });
    // Recompute rather than add: a student can be folded in again on a later
    // refresh, and their count should replace the old one, not stack onto it.
    entry.mergedPRs += count - (entry.contributors[login] ?? 0);
    entry.contributors[login] = count;
  }

  // A student may have had their last PR to an org removed (flagged, or the
  // repo failed validation), in which case they must drop out of that org.
  for (const [key, entry] of Object.entries(index)) {
    if (perOwner.has(key) || entry.contributors[login] === undefined) continue;
    entry.mergedPRs -= entry.contributors[login];
    delete entry.contributors[login];
    if (Object.keys(entry.contributors).length === 0) delete index[key];
  }
}

/**
 * Lowercased logins of students with at least one merged PR to this org.
 *
 * Lowercased deliberately: the index is keyed by the roster spelling of a
 * username while summaries carry GitHub's own casing, and the two differ often
 * enough to silently drop contributors from the org view if compared directly.
 */
export function contributorsForOrg(index: OrgIndex, orgLogin: string): Set<string> {
  return new Set(
    Object.keys(index[orgLogin.toLowerCase()]?.contributors ?? {}).map((l) => l.toLowerCase()),
  );
}
