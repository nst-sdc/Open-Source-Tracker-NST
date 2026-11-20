/**
 * lib/leaderboard.ts
 *
 * Builds the leaderboard for one set of filters: who is ranked, who is
 * registered but inactive, the podium, and the totals in the summary strip.
 *
 * Shared by app/contributors/page.tsx, which renders the first page of each
 * list, and app/api/leaderboard, which serves the next pages as the reader
 * scrolls. Until this split the page serialised all ~2,300 students with
 * their full profiles into every response (3 MB, about a second of CPU per
 * request); now a response carries 50 slim rows.
 *
 * Everything heavy here is in-memory work over the summary cache, which is
 * already held in process memory for a minute (lib/summary-cache.ts), so the
 * API page requests cost no extra store reads in the common case.
 */
import {
  getAllStudentSummaries,
  buildDateQuery,
  repoFromUrl,
  makeRepoMultiplierResolver,
  type StudentSummary,
} from './github';
import { getStudentsKV } from './kv-students';
import { getFlaggedPRIdSet } from './flagged';
import { readSummaryCache, writeSummaryCache, pruneToRoster } from './summary-cache';
import { readProfileCache } from './profile-cache';
import { getRepoCache, prExcludedBy } from './repo-cache';
import { aggregateMergedPRScore, isConcentrated, CONCENTRATED_DECAY, PER_REPO_DECAY } from './repo-score';
import { resolveOrganization } from './org-cache';
import { readOrgIndex, contributorsForOrg } from './org-index';
import { primeVouchedOrgs } from './kv-vouched-orgs';

export const PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const PREDEFINED_PERIODS = ['all', '1day', 'week', 'month', '2months', '3months', '6months', 'year'] as const;

export interface LeaderboardQuery {
  period: string;
  from?: string;
  to?: string;
  search: string;
  org: string;
  year: string;
  campus: string;
}

/** What a leaderboard row needs and nothing more. */
export interface LeaderboardRow {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Position on the full leaderboard for this period and org, so a filtered
   *  list never renumbers anyone. 0 for the inactive list. */
  rank: number;
  mergedPRs: number;
  openPRs: number;
  totalPRs: number;
  issuesCount: number;
  scoreMergedPRs: number;
  avgScore?: number;
  year?: string;
  campus?: string;
}

export interface Leaderboard {
  rosterEmpty: boolean;
  /** Ranked contributors matching the filters, best first. */
  active: LeaderboardRow[];
  /** Registered students with no activity in the period (empty in org mode). */
  other: LeaderboardRow[];
  podium: LeaderboardRow[];
  totals: { students: number; studentsInFilter: number; contributors: number; totalPRs: number; totalMerged: number };
  cachedAt: string | null;
  org: { login: string; name: string; avatarUrl?: string } | null;
  /** For the local-checkout banner: how many students have a fetched profile. */
  bootstrap: { populated: number; total: number };
}

export function parseLeaderboardQuery(p: Record<string, string | string[] | undefined>): LeaderboardQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  return {
    period: one(p.period) || 'all',
    from: one(p.from) || undefined,
    to: one(p.to) || undefined,
    search: one(p.search),
    org: one(p.org),
    year: one(p.year),
    campus: one(p.campus),
  };
}

export function toRow(s: StudentSummary, rank: number): LeaderboardRow {
  return {
    login: s.profile.login,
    name: s.profile.name ?? null,
    avatarUrl: s.profile.avatar_url,
    rank,
    mergedPRs: s.mergedPRs,
    openPRs: s.openPRs,
    totalPRs: s.totalPRs,
    issuesCount: s.issuesCount ?? 0,
    scoreMergedPRs: s.scoreMergedPRs,
    ...(s.avgScore !== undefined ? { avgScore: s.avgScore } : {}),
    ...(s.year ? { year: s.year } : {}),
    ...(s.campus ? { campus: s.campus } : {}),
  };
}

export const hasActivity = (s: StudentSummary) => s.totalPRs > 0 || (s.issuesCount ?? 0) > 0;

/** Text, year and campus filters of the normal (non-org) view. Pure. */
export function matchesFilters(s: StudentSummary, q: Pick<LeaderboardQuery, 'search' | 'year' | 'campus'>): boolean {
  if (q.search) {
    const needle = q.search.toLowerCase();
    const hit =
      s.profile.login.toLowerCase().includes(needle) ||
      (s.profile.name ?? '').toLowerCase().includes(needle) ||
      (s.year ?? '').toLowerCase().includes(needle) ||
      (s.campus ?? '').toLowerCase().includes(needle);
    if (!hit) return false;
  }
  if (q.year && s.year !== q.year) return false;
  if (q.campus && s.campus !== q.campus) return false;
  return true;
}

/** One page of a list. Pure. */
export function pageOf<T>(rows: T[], offset: number, limit: number): { rows: T[]; total: number; nextOffset: number | null } {
  const start = Math.max(0, Math.floor(offset));
  const size = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limit)));
  const page = rows.slice(start, start + size);
  const next = start + page.length;
  return { rows: page, total: rows.length, nextOffset: next < rows.length ? next : null };
}

const getCacheAgeMs = (cachedAt: string) => Date.now() - new Date(cachedAt).getTime();

async function loadSummaries(q: LeaderboardQuery, flaggedPRIds: Set<string>): Promise<{ summaries: StudentSummary[]; cachedAt: string | null }> {
  const dateQuery = buildDateQuery(q.period, q.from, q.to);
  const isPredefined = (PREDEFINED_PERIODS as readonly string[]).includes(q.period);
  const isTimeWindowed = isPredefined && q.period !== 'all';
  const MAX_WINDOW_CACHE_AGE_MS = 60 * 60 * 1000;

  if (isPredefined) {
    const cache = await readSummaryCache(q.period);
    if (cache && cache.cachedAt !== '1970-01-01T00:00:00.000Z') {
      if (!isTimeWindowed || getCacheAgeMs(cache.cachedAt) < MAX_WINDOW_CACHE_AGE_MS) {
        return { summaries: [...cache.summaries].sort((a, b) => b.scoreMergedPRs - a.scoreMergedPRs), cachedAt: cache.cachedAt };
      }
    }
  }
  try {
    const summaries = await getAllStudentSummaries(dateQuery, flaggedPRIds);
    let cachedAt: string | null = null;
    if (isPredefined) {
      try {
        await writeSummaryCache(summaries, q.period);
        cachedAt = new Date().toISOString();
      } catch (err) {
        // The page still gets the fresh numbers; only the cache missed out.
        console.error(`Could not store the ${q.period} summary cache:`, err);
      }
    }
    return { summaries, cachedAt };
  } catch (err) {
    console.error('Failed to fetch student summaries from GitHub API:', err);
    if (isPredefined) {
      const stale = await readSummaryCache(q.period);
      if (stale) {
        console.warn(`Falling back to stale summary cache for ${q.period} (cached at ${stale.cachedAt})`);
        return { summaries: stale.summaries, cachedAt: stale.cachedAt };
      }
    }
    return { summaries: [], cachedAt: null };
  }
}

/** Filters one student's PRs/issues down to a date window expressed as a GitHub search clause. */
function applyDateWindow<T extends { created_at: string }>(items: T[], dateQuery: string): T[] {
  const gt = dateQuery.match(/created:>([0-9-]{10})/);
  const range = dateQuery.match(/created:([0-9-]{10})\.\.([0-9-]{10})/);
  if (gt) {
    const min = new Date(gt[1]);
    return items.filter((i) => new Date(i.created_at) > min);
  }
  if (range) {
    const min = new Date(range[1]);
    const max = new Date(range[2]);
    min.setHours(0, 0, 0, 0);
    max.setHours(23, 59, 59, 999);
    return items.filter((i) => {
      const d = new Date(i.created_at);
      return d >= min && d <= max;
    });
  }
  return items;
}

export async function buildLeaderboard(q: LeaderboardQuery): Promise<Leaderboard> {
  const [students] = await Promise.all([getStudentsKV(), primeVouchedOrgs()]);
  const empty: Leaderboard = {
    rosterEmpty: true,
    active: [],
    other: [],
    podium: [],
    totals: { students: 0, studentsInFilter: 0, contributors: 0, totalPRs: 0, totalMerged: 0 },
    cachedAt: null,
    org: null,
    bootstrap: { populated: 0, total: 0 },
  };
  if (students.length === 0) return empty;

  const [flaggedPRIds, repoCache] = await Promise.all([getFlaggedPRIdSet(), getRepoCache()]);
  const loaded = await loadSummaries(q, flaggedPRIds);
  const cachedAt = loaded.cachedAt;
  // The roster is the only source of truth for who is a student; a period
  // cache may still carry people removed from it.
  const allSummaries = pruneToRoster(loaded.summaries, students);

  const studentsInFilter = students.filter((s) => (!q.year || s.year === q.year) && (!q.campus || s.campus === q.campus)).length;
  const bootstrap = {
    populated: allSummaries.filter((s) => /\/u\/\d+/.test(s.profile.avatar_url)).length + students.filter((s) => s.unresolvedSince).length,
    total: students.length,
  };

  // Global immutable leaderboard for the selected period.
  const ranked: Array<StudentSummary & { rank: number }> = allSummaries.filter(hasActivity).map((s, i) => ({ ...s, rank: i + 1 }));

  const cleanOrg = q.org.trim().replace(/^@/, '');
  const matchedOrg = cleanOrg ? await resolveOrganization(cleanOrg) : null;
  const isOrgSearch = Boolean(matchedOrg && matchedOrg.isOrganization);

  let active: LeaderboardRow[] = [];
  let other: LeaderboardRow[] = [];
  let totalPRs = 0;
  let totalMerged = 0;

  if (isOrgSearch && matchedOrg) {
    const targetOrgLogin = matchedOrg.login.toLowerCase();
    const dateQuery = buildDateQuery(q.period, q.from, q.to);
    // Only students the index says have merged PRs to this org need their
    // profile opened: ~46 reads for apache instead of ~2,300.
    const orgContributors = contributorsForOrg(await readOrgIndex(), targetOrgLogin);
    const orgSummaries: StudentSummary[] = [];
    const now = Date.now();

    await Promise.all(
      allSummaries
        .filter((s) => orgContributors.has(s.profile.login.toLowerCase()))
        .map(async (studentSummary) => {
          try {
            const cached = await readProfileCache(studentSummary.profile.login);
            if (!cached || !cached.prs || cached.prs.length === 0) return;
            let prs = cached.prs.filter((pr) => {
              if (!pr.repository_url) return false;
              return repoFromUrl(pr.repository_url).split('/')[0]?.toLowerCase() === targetOrgLogin;
            });
            if (prs.length === 0) return;
            prs = prs.filter((pr) => {
              const repo = repoFromUrl(pr.repository_url);
              if (flaggedPRIds.has(`${repo}#${pr.number}`)) return false;
              if (prExcludedBy(repoCache[repo], pr.pull_request?.merged_at)) return false;
              return true;
            });
            let issues = cached.issues || [];
            if (dateQuery) {
              prs = applyDateWindow(prs, dateQuery);
              issues = applyDateWindow(issues, dateQuery);
            }
            const mergedPRList = prs.filter((pr) => Boolean(pr.pull_request?.merged_at));
            if (mergedPRList.length === 0) return;
            if (q.year && studentSummary.year !== q.year) return;
            if (q.campus && studentSummary.campus !== q.campus) return;

            const orgIssues = issues.filter((is) => is.repository_url && repoFromUrl(is.repository_url).split('/')[0]?.toLowerCase() === targetOrgLogin);
            // Same resolver and decay as the leaderboard, so the org view cannot drift.
            const repoMultiplierFor = makeRepoMultiplierResolver(repoCache, studentSummary.profile.login, new Set(), now);
            const orgScore = aggregateMergedPRScore(
              mergedPRList,
              (pr) => (pr.repository_url ? repoFromUrl(pr.repository_url) : null),
              repoMultiplierFor,
              (repo, count) => (repo && isConcentrated(count, repoCache[repo]?.signals) ? CONCENTRATED_DECAY : PER_REPO_DECAY),
            );
            orgSummaries.push({
              profile: studentSummary.profile,
              totalPRs: prs.length,
              mergedPRs: mergedPRList.length,
              openPRs: prs.filter((pr) => pr.state === 'open').length,
              closedPRs: prs.filter((pr) => pr.state === 'closed' && !pr.pull_request?.merged_at).length,
              scoreMergedPRs: orgScore,
              issuesCount: orgIssues.length,
              year: studentSummary.year,
              campus: studentSummary.campus,
              organizations: [matchedOrg.login],
            });
          } catch (err) {
            console.error(`Error processing org contributions for ${studentSummary.profile.login}:`, err);
          }
        }),
    );

    // Rank by contribution to THIS org: merged PRs, then score, then total PRs, then login.
    orgSummaries.sort((a, b) => {
      if (b.mergedPRs !== a.mergedPRs) return b.mergedPRs - a.mergedPRs;
      if (b.scoreMergedPRs !== a.scoreMergedPRs) return b.scoreMergedPRs - a.scoreMergedPRs;
      if (b.totalPRs !== a.totalPRs) return b.totalPRs - a.totalPRs;
      return a.profile.login.localeCompare(b.profile.login);
    });
    active = orgSummaries.map((s, i) => toRow(s, i + 1));
    totalPRs = orgSummaries.reduce((n, s) => n + s.totalPRs, 0);
    totalMerged = orgSummaries.reduce((n, s) => n + s.mergedPRs, 0);
  } else {
    const matching = allSummaries.filter((s) => matchesFilters(s, q));
    totalPRs = matching.reduce((n, s) => n + s.totalPRs, 0);
    totalMerged = matching.reduce((n, s) => n + s.mergedPRs, 0);
    active = ranked.filter((s) => matchesFilters(s, q)).map((s) => toRow(s, s.rank));
    other = matching.filter((s) => !hasActivity(s)).map((s) => toRow(s, 0));
  }

  // Org mode: that org's top 3. Normal mode: the global top 3, hidden while a
  // text/year/campus filter is active.
  const podium = isOrgSearch ? active.slice(0, 3) : q.search || q.year || q.campus ? [] : ranked.slice(0, 3).map((s) => toRow(s, s.rank));

  return {
    rosterEmpty: false,
    active,
    other,
    podium,
    totals: { students: students.length, studentsInFilter, contributors: active.length, totalPRs, totalMerged },
    cachedAt,
    org: isOrgSearch && matchedOrg ? { login: matchedOrg.login, name: matchedOrg.name || matchedOrg.login, avatarUrl: matchedOrg.avatarUrl } : null,
    bootstrap,
  };
}
