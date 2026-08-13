import { readFileSync } from 'fs';
import { join } from 'path';
import { getStudentsKV, removeStudent } from './kv-students';
import { getExceptionRepoSetForUser, getOwnRepoExceptions, buildOwnRepoExceptionMap, EMPTY_REPO_SET } from './kv-own-repo-exceptions';
import { getRepoCache, saveRepoCache } from './repo-cache';
import { readProfileCache, writeProfileCache, type ProfileCacheEntry } from './profile-cache';
import { execSync } from 'child_process';
import { cookies } from 'next/headers';
import { kvGet, kvSet } from './kv';

let cachedToken: string | undefined = process.env.GITHUB_TOKEN;
let checkedGhCli = false;

export function getGitHubToken(): string | undefined {
  if (cachedToken) return cachedToken;
  if (checkedGhCli) return undefined;
  checkedGhCli = true;
  try {
    const token = execSync('gh auth token', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (token && token.startsWith('gh')) {
      console.log('Successfully loaded GitHub token from GitHub CLI.');
      cachedToken = token;
      return token;
    }
  } catch (e) {
    // gh CLI not installed or not logged in
  }
  return undefined;
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || (typeof window === 'undefined' ? getGitHubToken() : undefined);

export class GitHubRateLimitError extends Error {
  constructor(message = 'GitHub API rate limit exceeded') {
    super(message);
    this.name = 'GitHubRateLimitError';
  }
}

/** Thrown when an explicitly-passed token (e.g. a pool token assigned to a
 * parallel refresh worker) is rejected as unauthorized — distinct from a
 * cookie-session token being invalid, so callers can evict it from the pool. */
export class InvalidTokenError extends Error {
  constructor(message = 'GitHub token is invalid or revoked') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

let memoryTokenPool: string[] | null = null;
let lastPoolFetch = 0;

export async function getGitHubHeaders(explicitToken?: string): Promise<HeadersInit> {
  // An explicit token (e.g. one worker's assigned slice of the token pool
  // during a parallelized batch refresh) always wins over cookie/pool lookup.
  if (explicitToken) {
    return {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${explicitToken}`,
    };
  }

  let token: string | undefined = undefined;
  try {
    const cookieStore = await cookies();
    token = cookieStore.get('github_oauth_token')?.value;
  } catch {
    // cookies() can throw when evaluated outside of request contexts (e.g. static rendering)
  }

  // If no session token, pick a random token from the pool (cached in memory for 60s)
  if (!token) {
    const now = Date.now();
    if (!memoryTokenPool || now - lastPoolFetch > 60000) {
      try {
        const pool = await kvGet<Record<string, string>>('github_token_pool');
        if (pool) {
          memoryTokenPool = Object.values(pool);
        } else {
          memoryTokenPool = [];
        }
        lastPoolFetch = now;
      } catch {
        memoryTokenPool = memoryTokenPool || [];
      }
    }
    
    if (memoryTokenPool && memoryTokenPool.length > 0) {
      token = memoryTokenPool[Math.floor(Math.random() * memoryTokenPool.length)];
    }
  }

  if (!token) {
    token = GITHUB_TOKEN;
  }

  return {
    Accept: 'application/vnd.github.v3+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const TOKEN_POOL_KEY = 'github_token_pool';

/**
 * Returns every distinct token available to spread refresh work across:
 * the system GITHUB_TOKEN plus every OAuth token contributed to the pool by
 * logged-in users. More logged-in users over time => more independent
 * 30 req/min search budgets => proportionally more students refreshed per
 * incremental cron tick, with no code change needed as the pool grows.
 */
export async function getAvailableTokens(): Promise<string[]> {
  const tokens = new Set<string>();
  if (GITHUB_TOKEN) tokens.add(GITHUB_TOKEN);
  try {
    const pool = await kvGet<Record<string, string>>(TOKEN_POOL_KEY);
    if (pool) {
      for (const t of Object.values(pool)) {
        if (t) tokens.add(t);
      }
    }
  } catch (err) {
    console.error('Failed to read github_token_pool:', err);
  }
  return [...tokens];
}

/** Evicts a specific token from the shared pool — used when a pool token
 * turns out to be revoked/expired, so it stops being handed to future
 * refresh workers. Never removes the system GITHUB_TOKEN (it isn't stored
 * in the pool map to begin with). */
export async function removePoolToken(token: string): Promise<void> {
  try {
    const pool = await kvGet<Record<string, string>>(TOKEN_POOL_KEY);
    if (!pool) return;
    const entries = Object.entries(pool).filter(([, v]) => v !== token);
    if (entries.length === Object.keys(pool).length) return; // wasn't in the pool
    await kvSet(TOKEN_POOL_KEY, Object.fromEntries(entries));
    console.warn('Evicted invalid/revoked token from github_token_pool.');
  } catch (err) {
    console.error('Failed to evict token from github_token_pool:', err);
  }
}

async function githubSearch<T>(
  q: string,
  page = 1,
  perPage = 100,
  retryWithSystemToken = true,
  token?: string
): Promise<{ total_count: number; items: T[] } | null> {
  let headers = await getGitHubHeaders(token);
  let res = await fetch(
    `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=${perPage}&page=${page}`,
    { headers, next: { revalidate: 3600 } }
  );
  if (!res.ok) {
    if (res.status === 401 && token) {
      // An explicitly-assigned token (pool worker) is invalid/revoked — let
      // the caller evict it instead of silently falling back, so a dead
      // token doesn't keep getting handed to future batches.
      throw new InvalidTokenError();
    }
    if (res.status === 401 && retryWithSystemToken && GITHUB_TOKEN) {
      console.warn('OAuth token in cookie was unauthorized. Retrying with system GITHUB_TOKEN...');
      headers = {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      };
      res = await fetch(
        `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=${perPage}&page=${page}`,
        { headers, next: { revalidate: 3600 } }
      );
      if (res.ok) {
        return res.json();
      }
    }
    if (res.status === 403 || res.status === 429) {
      throw new GitHubRateLimitError();
    }
    return null;
  }
  return res.json();
}

async function githubSearchAll<T>(
  q: string,
  token?: string
): Promise<{ total_count: number; items: T[] } | null> {
  const allItems: T[] = [];
  let page = 1;
  const maxPages = (token || GITHUB_TOKEN) ? 10 : 3;
  let totalCount = 0;

  while (page <= maxPages) {
    const data = await githubSearch<T>(q, page, 100, true, token);
    if (!data) {
      if (page === 1) return null;
      break;
    }
    totalCount = data.total_count;
    allItems.push(...data.items);
    if (allItems.length >= data.total_count || data.items.length < 100) break;
    page++;
    if (page <= maxPages) {
      await new Promise((r) => setTimeout(r, (token || GITHUB_TOKEN) ? 200 : 1000));
    }
  }

  return { total_count: totalCount, items: allItems };
}


export interface StudentPR {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  repository_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  draft: boolean;
  labels: Array<{ id: number; name: string; color: string }>;
  pull_request: {
    merged_at: string | null;
    html_url: string;
  };
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter_username: string | null;
  created_at: string;
}

export interface Student {
  github: string;
  year?: '1st year' | '2nd year' | '3rd year' | '4th year';
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA';
}

export interface StudentSummary {
  profile: GitHubUser;
  totalPRs: number;
  mergedPRs: number;
  openPRs: number;
  closedPRs: number;
  /** mergedPRs minus any flagged merged PRs — used for ranking */
  scoreMergedPRs: number;
  issuesCount: number;
  year?: '1st year' | '2nd year' | '3rd year' | '4th year';
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA';
  cachedAt?: string;
}

// getStudents() has been replaced with getStudentsKV() from './kv-students'

export async function getStudentProfile(username: string, retryWithSystemToken = true, token?: string): Promise<GitHubUser | null> {
  let headers = await getGitHubHeaders(token);
  let res = await fetch(`https://api.github.com/users/${username}`, {
    headers,
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    if (res.status === 401 && token) {
      throw new InvalidTokenError();
    }
    if (res.status === 401 && retryWithSystemToken && GITHUB_TOKEN) {
      console.warn('OAuth token in cookie was unauthorized. Retrying with system GITHUB_TOKEN...');
      headers = {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      };
      res = await fetch(`https://api.github.com/users/${username}`, {
        headers,
        next: { revalidate: 3600 },
      });
      if (res.ok) return res.json();
    }
    if (res.status === 404) {
      return null;
    }
    if (res.status === 403 || res.status === 429) {
      throw new GitHubRateLimitError();
    }
    throw new Error(`GitHub API returned status ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/** Fetches missing repository metadata from GitHub and updates the repo cache */
export async function validateNewRepos(
  prs: StudentPR[],
  repoCacheMap: import('./repo-cache').RepoCacheMap,
  token?: string
): Promise<{ updated: boolean, map: import('./repo-cache').RepoCacheMap }> {
  let updated = false;

  // Extract unique repo full names (e.g. "owner/repo")
  const uniqueRepos = new Set<string>();
  for (const pr of prs) {
    if (!pr.repository_url) continue;
    const repoFullName = pr.repository_url.replace('https://api.github.com/repos/', '');
    if (!repoCacheMap[repoFullName]) {
      uniqueRepos.add(repoFullName);
    }
  }

  if (uniqueRepos.size === 0) return { updated, map: repoCacheMap };

  const headers = await getGitHubHeaders(token);

  for (const repoFullName of uniqueRepos) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const stars = data.stargazers_count || 0;
        const forks = data.forks_count || 0;
        repoCacheMap[repoFullName] = {
          stars,
          forks,
          valid: stars >= 5 // MUST have 5 stars to be considered valid
        };
        updated = true;
      } else if (res.status === 404) {
        // Deleted or private repo
        repoCacheMap[repoFullName] = { stars: 0, forks: 0, valid: false };
        updated = true;
      } else if (res.status === 401 && token) {
        throw new InvalidTokenError();
      } else if (res.status === 403 || res.status === 429) {
        // This endpoint (GET /repos/:owner/:repo) is core-API, not search — its
        // budget is 5000/hr, so a 403/429 here is almost always GitHub's secondary
        // abuse-detection reacting to a tight request burst, not real quota
        // exhaustion. Previously this `break`d the whole batch, silently leaving
        // every remaining repo unvalidated (and therefore fail-open / treated as
        // valid by scoring) until they happened to come up again in some later
        // run. Only stop early if we've actually run out of primary quota;
        // otherwise back off briefly and keep going so one unlucky repo can't
        // strand the rest of the batch.
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining === '0') {
          console.warn(`Core rate limit exhausted checking repo: ${repoFullName}. Stopping batch.`);
          break;
        }
        console.warn(`Secondary rate limit hit checking repo: ${repoFullName}. Backing off and continuing.`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      if (err instanceof InvalidTokenError) throw err;
      console.error(`Failed to check repo ${repoFullName}:`, err);
    }

    // Small pacing between requests so a long batch doesn't itself trigger
    // secondary rate limiting.
    await new Promise((r) => setTimeout(r, 150));
  }

  return { updated, map: repoCacheMap };
}



export interface StudentIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  repository_url: string;
  created_at: string;
  closed_at: string | null;
  comments: number;
  labels: Array<{ id: number; name: string; color: string }>;
  user: { login: string; avatar_url: string; html_url: string };
}

// PRs authored by username in repos NOT owned by username (excludes own repos & forks)
function searchPRs(username: string, extra = '', page = 1, perPage = 100, token?: string) {
  return githubSearch<StudentPR>(
    `is:pr author:${username} -user:${username}${extra ? ' ' + extra : ''}`,
    page,
    perPage,
    true,
    token
  );
}

export async function getStudentIssues(username: string, token?: string): Promise<StudentIssue[] | null> {
  const all: StudentIssue[] = [];
  let page = 1;
  const maxPages = (token || GITHUB_TOKEN) ? 10 : 3;
  while (page <= maxPages) {
    const data = await githubSearch<StudentIssue>(
      `is:issue author:${username} -user:${username}`,
      page,
      100,
      true,
      token
    );
    if (!data) return null;
    all.push(...data.items);
    if (all.length >= data.total_count || data.items.length < 100) break;
    page++;
  }
  return all;
}

export async function getStudentReviews(username: string): Promise<StudentPR[]> {
  const all: StudentPR[] = [];
  let page = 1;
  const maxPages = GITHUB_TOKEN ? 10 : 3;
  while (page <= maxPages) {
    const data = await githubSearch<StudentPR>(
      `is:pr reviewed-by:${username} -user:${username} -author:${username}`,
      page
    );
    if (!data) break;
    all.push(...data.items);
    if (all.length >= data.total_count || data.items.length < 100) break;
    page++;
  }
  return all;
}


export async function getStudentPRs(username: string, token?: string): Promise<StudentPR[] | null> {
  const allPRs: StudentPR[] = [];
  let page = 1;
  const maxPages = (token || GITHUB_TOKEN) ? 10 : 3;

  while (page <= maxPages) {
    const data = await searchPRs(username, '', page, 100, token);
    if (!data) return null;
    allPRs.push(...data.items);
    if (allPRs.length >= data.total_count || data.items.length < 100) break;
    page++;
  }

  // Admin-approved own-repo PRs (see lib/kv-own-repo-exceptions.ts) — merged
  // in here so every caller (leaderboard refresh, /check-work, achiever
  // profiles, manual refresh) gets them consistently, without each needing
  // to remember to ask for them separately.
  const exceptionRepos = await getExceptionRepoSetForUser(username);
  if (exceptionRepos.size > 0) {
    const ownRepoPRs = await getOwnRepoExceptionPRs(username, exceptionRepos, token);
    allPRs.push(...ownRepoPRs);
  }

  return allPRs;
}

/**
 * PRs a student opened against their own repos, restricted to the specific
 * repos an admin has explicitly approved (see lib/kv-own-repo-exceptions.ts).
 * Only called when the student has at least one approved repo — zero extra
 * API cost for the vast majority of students who have none. Deliberately not
 * gated on star/fork counts: those are gameable by the repo's own owner in a
 * small, socially-connected student community, so admin review is the only
 * check used here.
 */
async function getOwnRepoExceptionPRs(username: string, allowedRepos: Set<string>, token?: string): Promise<StudentPR[]> {
  const allPRs: StudentPR[] = [];
  let page = 1;
  const maxPages = (token || GITHUB_TOKEN) ? 10 : 3;

  while (page <= maxPages) {
    const data = await githubSearch<StudentPR>(
      `is:pr author:${username} user:${username}`,
      page,
      100,
      true,
      token
    );
    if (!data) break;
    allPRs.push(...data.items);
    if (allPRs.length >= data.total_count || data.items.length < 100) break;
    page++;
  }

  return allPRs.filter((pr) => pr.repository_url && allowedRepos.has(repoFromUrl(pr.repository_url).toLowerCase()));
}

export function getSummaryFromCache(
  cached: ProfileCacheEntry,
  dateQuery: string,
  flaggedPRIds: Set<string>,
  repoCacheMap: import('./repo-cache').RepoCacheMap = {},
  ownRepoExceptions: Set<string> = new Set()
): StudentSummary {
  let prs = cached.prs || [];
  let issues = cached.issues || [];

  // Strip out junk entirely — manually flagged PRs, or PRs merged into repos that
  // failed star validation — so it never counts toward anything displayed,
  // not just the ranking score. Admin-approved own-repo exceptions
  // (lib/kv-own-repo-exceptions.ts) bypass the star-validation exclusion
  // specifically — an admin already vetted that repo individually, so a low
  // star count shouldn't silently undo the approval.
  prs = prs.filter((pr) => {
    if (!pr.repository_url) return true;
    const repo = pr.repository_url.replace('https://api.github.com/repos/', '');
    const key = `${repo}#${pr.number}`;
    if (flaggedPRIds.has(key)) return false;
    if (ownRepoExceptions.has(repo.toLowerCase())) return true;
    const repoEntry = repoCacheMap[repo];
    if (repoEntry && repoEntry.valid === false) return false;
    return true;
  });

  if (dateQuery) {
    const gtMatch = dateQuery.match(/created:>([0-9-]{10})/);
    const rangeMatch = dateQuery.match(/created:([0-9-]{10})\.\.([0-9-]{10})/);

    if (gtMatch) {
      const minDate = new Date(gtMatch[1]);
      prs = prs.filter((pr) => new Date(pr.created_at) > minDate);
      issues = issues.filter((is) => new Date(is.created_at) > minDate);
    } else if (rangeMatch) {
      const minDate = new Date(rangeMatch[1]);
      const maxDate = new Date(rangeMatch[2]);
      minDate.setHours(0, 0, 0, 0);
      maxDate.setHours(23, 59, 59, 999);
      prs = prs.filter((pr) => {
        const d = new Date(pr.created_at);
        return d >= minDate && d <= maxDate;
      });
      issues = issues.filter((is) => {
        const d = new Date(is.created_at);
        return d >= minDate && d <= maxDate;
      });
    }
  }

  const totalPRs = prs.length;
  const mergedPRs = prs.filter((pr) => pr.pull_request?.merged_at).length;
  const openPRs = prs.filter((pr) => pr.state === 'open').length;
  const closedPRs = prs.filter((pr) => pr.state === 'closed' && !pr.pull_request?.merged_at).length;

  return {
    profile: cached.profile,
    totalPRs,
    mergedPRs,
    openPRs,
    closedPRs,
    // Junk is already stripped out of `prs` above, so this is just mergedPRs —
    // kept as a separate field since callers sort/rank on it specifically.
    scoreMergedPRs: mergedPRs,
    issuesCount: issues.length,
    cachedAt: cached.cachedAt,
  };
}

export async function getAllStudentSummaries(
  dateQuery = '',
  flaggedPRIds: Set<string> = new Set(),
  forceLive = false
): Promise<StudentSummary[]> {
  const students = await getStudentsKV();
  if (students.length === 0) return [];

  const repoCache = await getRepoCache();
  const summaries: StudentSummary[] = [];
  // Fetched once regardless of roster size — the exceptions list itself is
  // expected to stay small (a handful of admin-approved repos), so this is a
  // single cheap KV read shared across every student's summary computation
  // below, rather than one read per student.
  const ownRepoExceptionMap = buildOwnRepoExceptionMap(await getOwnRepoExceptions());

  // ── Phase 1: Resolve from individual profile caches (zero API calls) ──
  if (!forceLive) {
    // Firing one KV read per student all at once (1800+ simultaneous requests at
    // current roster size) causes a meaningful fraction to fail under that
    // connection burst — and a failed read here was previously indistinguishable
    // from "never cached", silently turning real, correctly-cached students into
    // zero-PR placeholders. Reading in small concurrent batches, with one retry
    // per failed read, keeps this reliable instead of load-dependent.
    const READ_BATCH_SIZE = 50;
    const cachedResults: Array<{ student: Student; cached: ProfileCacheEntry | null }> = [];

    for (let i = 0; i < students.length; i += READ_BATCH_SIZE) {
      const batch = students.slice(i, i + READ_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (student) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const cached = await readProfileCache(student.github);
              return { student, cached };
            } catch (err) {
              if (attempt === 1) {
                console.error(`Failed to read profile cache for ${student.github} after retry:`, err);
              }
            }
          }
          return { student, cached: null };
        })
      );
      cachedResults.push(...batchResults);
    }

    for (const { student, cached } of cachedResults) {
      if (cached) {
        const ownRepoExceptions = ownRepoExceptionMap.get(student.github.toLowerCase()) ?? EMPTY_REPO_SET;
        const summary = getSummaryFromCache(cached, dateQuery, flaggedPRIds, repoCache, ownRepoExceptions);
        summary.year = student.year;
        summary.campus = student.campus;
        summaries.push(summary);
      } else {
        const placeholder: StudentSummary = {
          profile: {
            login: student.github,
            name: student.github,
            avatar_url: `https://avatars.githubusercontent.com/${student.github}?s=100`,
            html_url: `https://github.com/${student.github}`,
            bio: null,
            public_repos: 0,
            followers: 0,
            following: 0,
            company: null,
            location: null,
            blog: null,
            twitter_username: null,
            created_at: new Date().toISOString(),
          },
          totalPRs: 0,
          mergedPRs: 0,
          openPRs: 0,
          closedPRs: 0,
          scoreMergedPRs: 0,
          issuesCount: 0,
          year: student.year,
          campus: student.campus,
        };
        summaries.push(placeholder);
      }
    }

    return summaries.sort((a, b) => b.scoreMergedPRs - a.scoreMergedPRs);
  }

  // ── Phase 2: Fetch remaining (or all) students individually ────────
  // GitHub's Search API rejects multi-author OR queries outright (422
  // Validation Failed) even for the simplest two-term case — verified
  // empirically against well-known accounts, contradicting the documented
  // "up to 5 operators" limit. Batching multiple authors into one query via
  // OR is not usable, so each student gets its own single-author search.
  const studentsToFetch = students;
  const successfulFetches = new Map<string, boolean>();
  const studentPRMap = new Map<string, StudentPR[]>();
  const studentIssueMap = new Map<string, StudentIssue[]>();

  for (let i = 0; i < studentsToFetch.length; i++) {
    const username = studentsToFetch[i].github;
    const lowerName = username.toLowerCase();
    const prQuery = `is:pr author:${username} -user:${username}${dateQuery ? ' ' + dateQuery : ''}`;
    const issueQuery = `is:issue author:${username} -user:${username}${dateQuery ? ' ' + dateQuery : ''}`;

    const fetchOnce = () =>
      Promise.allSettled([
        githubSearchAll<StudentPR>(prQuery),
        githubSearchAll<StudentIssue>(issueQuery),
      ]);

    let results = await fetchOnce();
    let prFulfilled = results[0].status === 'fulfilled' && results[0].value !== null;
    let issueFulfilled = results[1].status === 'fulfilled' && results[1].value !== null;
    const wasRateLimited =
      (results[0].status === 'rejected' && results[0].reason instanceof GitHubRateLimitError) ||
      (results[1].status === 'rejected' && results[1].reason instanceof GitHubRateLimitError);

    if ((!prFulfilled || !issueFulfilled) && wasRateLimited) {
      console.log(`Rate limit fetching ${username}, waiting 65s and retrying...`);
      await new Promise((r) => setTimeout(r, 65_000));
      results = await fetchOnce();
      prFulfilled = results[0].status === 'fulfilled' && results[0].value !== null;
      issueFulfilled = results[1].status === 'fulfilled' && results[1].value !== null;
    }

    const success = prFulfilled && issueFulfilled;
    successfulFetches.set(lowerName, success);
    if (success) {
      studentPRMap.set(lowerName, (results[0] as PromiseFulfilledResult<any>).value.items);
      studentIssueMap.set(lowerName, (results[1] as PromiseFulfilledResult<any>).value.items);
    } else {
      if (results[0].status === 'rejected') console.error(`PR fetch failed for ${username}:`, results[0].reason);
      if (results[1].status === 'rejected') console.error(`Issue fetch failed for ${username}:`, results[1].reason);
    }

    if (i < studentsToFetch.length - 1) {
      await new Promise((r) => setTimeout(r, GITHUB_TOKEN ? 1500 : 6500));
    }
  }

  // ── Build summaries for fetched students ───────────────────────────
  for (const student of studentsToFetch) {
    const lowerName = student.github.toLowerCase();
    const isSuccess = successfulFetches.get(lowerName) ?? false;
    const cached = await readProfileCache(student.github);

    if (!isSuccess && cached) {
      // Fallback to stale cache if this student's fetch failed
      const ownRepoExceptions = ownRepoExceptionMap.get(lowerName) ?? EMPTY_REPO_SET;
      const summary = getSummaryFromCache(cached, dateQuery, flaggedPRIds, repoCache, ownRepoExceptions);
      summary.year = student.year;
      summary.campus = student.campus;
      summaries.push(summary);
      continue;
    }

    const prs = studentPRMap.get(lowerName) || [];
    const issues = studentIssueMap.get(lowerName) || [];

    // Resolve profile (cache → live → placeholder)
    let profile: GitHubUser | null = null;
    if (cached) {
      profile = cached.profile;
    } else {
      try {
        profile = await getStudentProfile(student.github);
      } catch (err) {
        console.error(`Failed to load profile for ${student.github}:`, err);
      }
    }

    if (!profile) {
      profile = {
        login: student.github,
        avatar_url: `https://github.com/${student.github}.png`,
        html_url: `https://github.com/${student.github}`,
        name: student.github,
        bio: null,
        public_repos: 0,
        followers: 0,
        following: 0,
        company: null,
        location: null,
        blog: null,
        twitter_username: null,
        created_at: new Date().toISOString(),
      };
    }

    // Persist to profile cache when fetching ALL-TIME data (no date filter) AND batch fetch succeeded
    // so future custom date queries can compute locally from cache
    if (!dateQuery && isSuccess) {
      writeProfileCache(student.github, profile, prs, issues).catch((err) =>
        console.error(`Failed to write profile cache for ${student.github}:`, err)
      );
    }

    // Strip out junk (manually flagged, or repos that failed star validation)
    // before computing any displayed stat — the cache write above keeps the
    // full raw history, but nothing junk should count toward what's shown.
    const validPRs = prs.filter((pr) => {
      if (!pr.repository_url) return true;
      const repo = pr.repository_url.replace('https://api.github.com/repos/', '');
      const key = `${repo}#${pr.number}`;
      if (flaggedPRIds.has(key)) return false;
      const repoEntry = repoCache[repo];
      if (repoEntry && repoEntry.valid === false) return false;
      return true;
    });

    const totalPRs = validPRs.length;
    const mergedPRs = validPRs.filter((pr) => pr.pull_request?.merged_at).length;
    const openPRs = validPRs.filter((pr) => pr.state === 'open').length;
    const closedPRs = validPRs.filter((pr) => pr.state === 'closed' && !pr.pull_request?.merged_at).length;

    summaries.push({
      profile,
      totalPRs,
      mergedPRs,
      openPRs,
      closedPRs,
      scoreMergedPRs: mergedPRs,
      issuesCount: issues.length,
      year: student.year,
      campus: student.campus,
    });
  }

  // Rank by effective merged PRs
  return summaries.sort((a, b) => b.scoreMergedPRs - a.scoreMergedPRs);
}

export function repoFromUrl(repoUrl: string): string {
  return repoUrl.replace('https://api.github.com/repos/', '');
}

export function buildDateQuery(period: string, from?: string, to?: string): string {
  const toISO = (d: Date) => d.toISOString().split('T')[0];
  const ago = (days: number) => toISO(new Date(Date.now() - days * 86_400_000));
  switch (period) {
    case '1day':    return `created:>${ago(1)}`;
    case 'week':    return `created:>${ago(7)}`;
    case 'month':   return `created:>${ago(30)}`;
    case '2months': return `created:>${ago(60)}`;
    case '3months': return `created:>${ago(90)}`;
    case '6months': return `created:>${ago(180)}`;
    case 'year':    return `created:>${ago(365)}`;
    case 'custom':
      if (from && to)  return `created:${from}..${to}`;
      if (from)        return `created:>${from}`;
      return '';
    default: return '';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export async function refreshStudentCache(username: string, token?: string): Promise<void> {
  console.log(`Refreshing cache for user: ${username}`);
  const profile = await getStudentProfile(username, true, token);

  if (!profile) {
    console.warn(`Profile not found (404) for user: ${username}. It will be removed from tracking.`);
    throw new NotFoundError(`Profile not found for user: ${username}`);
  }

  const prs = await getStudentPRs(username, token);
  const issues = await getStudentIssues(username, token);

  if (prs === null || issues === null) {
    throw new Error(`Failed to fetch contributions for user: ${username}`);
  }

  // Validate any new repos found in PRs. Note: admin-approved own-repo
  // exception PRs (merged into `prs` inside getStudentPRs) will also pass
  // through here — that's fine, since a repo the student owns and an admin
  // has already vetted individually doesn't need the automated star-count
  // check to also pass; validateNewRepos only ever excludes on a failed
  // check, it never un-approves an admin exception.
  const currentRepoCache = await getRepoCache();
  const { updated, map } = await validateNewRepos(prs, currentRepoCache, token);
  if (updated) {
    await saveRepoCache(map);
  }

  await writeProfileCache(username, profile, prs, issues);
}

// Each student refresh costs 2 search-API calls (PRs + issues). Staying at
// 25/min (vs GitHub's real 30/min limit) per token leaves headroom for
// concurrent traffic — real visitors, manual refreshes, check-work previews —
// sharing the same tokens.
const SEARCH_CALLS_PER_STUDENT = 2;
const SAFE_SEARCH_PER_MIN = 25;
const PACING_MS_PER_STUDENT = Math.ceil(60_000 / (SAFE_SEARCH_PER_MIN / SEARCH_CALLS_PER_STUDENT));

// How many candidates to select per token — deliberately generous. The real
// safety mechanism is TICK_DEADLINE_MS below, not this number: actual
// per-student cost varies a lot (validateNewRepos can add anywhere from 0 to
// many extra core-API calls depending on how many repos a student's PRs
// touch that haven't been seen before), so picking a batch size by estimating
// time-per-student is fragile — this was tried and hit
// FUNCTION_INVOCATION_TIMEOUT in practice. Selecting more candidates than we
// can necessarily finish is fine: whatever isn't reached before the deadline
// simply stays stale and gets picked up next tick.
const PER_TOKEN_CANDIDATE_POOL = 50;
// Defensive ceiling in case the token pool ever grows very large — a single
// tick shouldn't try to select an unbounded number of candidates.
const MAX_TOTAL_BATCH = 400;
// Hard wall-clock cutoff for actually processing students, independent of how
// many were selected — kept well under the route's maxDuration (180s) so a
// slow student (or several) can never push the whole tick into a platform
// timeout. Each token's group checks this before starting its next student.
const TICK_DEADLINE_MS = 150_000;

/**
 * How many candidates to select for one incremental tick, given how many
 * distinct GitHub tokens are currently available. Scales automatically as
 * more users log in and contribute their OAuth token to the shared pool —
 * no code change needed to go faster as the pool grows. Actual throughput is
 * still bounded by TICK_DEADLINE_MS, not this number.
 */
function computeAutoBatchSize(tokenCount: number): number {
  return Math.max(1, Math.min(MAX_TOTAL_BATCH, tokenCount * PER_TOKEN_CANDIDATE_POOL));
}

export async function updateStaleProfiles(batchSize?: number): Promise<{ updated: string[]; attempted: string[] }> {
  const students = await getStudentsKV();
  if (students.length === 0) return { updated: [], attempted: [] };

  const tokens = await getAvailableTokens();
  const effectiveBatchSize = batchSize ?? computeAutoBatchSize(tokens.length);
  console.log(`[Incremental Refresh] ${tokens.length} token(s) available, batch size ${effectiveBatchSize}`);

  /** Minimum age before a profile is considered stale and eligible for background refresh */
  const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();

  // 1. Read refresh queue from KV (manually triggered high-priority refreshes)
  let queue: string[] = [];
  try {
    queue = await kvGet<string[]>('refresh_queue') || [];
  } catch {
    queue = [];
  }

  const studentUsernamesSet = new Set(students.map(s => s.github.toLowerCase()));
  const validQueue = queue.filter(username => studentUsernamesSet.has(username.toLowerCase()));

  // 2. Select targets
  const targetsUsernames: string[] = [];

  // High-priority queue items first (no staleness check needed)
  const queueTargets = validQueue.slice(0, effectiveBatchSize);
  targetsUsernames.push(...queueTargets);

  // 3. Fill remaining slots using cache age data from the main summaries cache (single KV read)
  if (targetsUsernames.length < effectiveBatchSize) {
    const remainingCount = effectiveBatchSize - targetsUsernames.length;
    const excludedSet = new Set(targetsUsernames.map(u => u.toLowerCase()));

    // Try to load cached summaries to read cache timestamps without querying 1900+ keys
    const cacheMap = new Map<string, string>(); // username (lower) -> cachedAt ISO string
    try {
      const summaryCache = await kvGet<{ summaries: StudentSummary[] }>('summary_cache:all');
      if (summaryCache && Array.isArray(summaryCache.summaries)) {
        for (const s of summaryCache.summaries) {
          if (s.profile?.login && s.cachedAt) {
            cacheMap.set(s.profile.login.toLowerCase(), s.cachedAt);
          }
        }
      }
    } catch (err) {
      console.warn('[Incremental Refresh] Could not load summary cache to determine age:', err);
    }

    // Classify students who are not already excluded
    const neverCached: string[] = [];
    const staleCached: Array<{ username: string; cachedAtTime: number }> = [];

    for (const student of students) {
      const lower = student.github.toLowerCase();
      if (excludedSet.has(lower)) continue;

      const cachedAtStr = cacheMap.get(lower);
      if (!cachedAtStr) {
        neverCached.push(student.github);
      } else {
        const cachedAtTime = new Date(cachedAtStr).getTime();
        if (now - cachedAtTime >= STALE_THRESHOLD_MS) {
          staleCached.push({ username: student.github, cachedAtTime });
        }
      }
    }

    // Prioritize never-cached targets first
    const neverCachedTargets = neverCached.slice(0, remainingCount);
    targetsUsernames.push(...neverCachedTargets);
    neverCachedTargets.forEach(u => excludedSet.add(u.toLowerCase()));

    // Fill the remaining slots with stale profiles (oldest first)
    if (targetsUsernames.length < effectiveBatchSize) {
      const stillRemaining = effectiveBatchSize - targetsUsernames.length;
      staleCached.sort((a, b) => a.cachedAtTime - b.cachedAtTime);
      const staleTargets = staleCached.slice(0, stillRemaining).map(s => s.username);
      targetsUsernames.push(...staleTargets);
    }

    if (targetsUsernames.length === 0) {
      console.log('[Incremental Refresh] All profiles are fresh (< 24hrs). Skipping batch refresh.');
      return { updated: [], attempted: [] };
    }
  }

  // 4. Process targets — split across every available token and refresh each
  //    token's slice concurrently. Wall-clock time for the whole tick is
  //    bounded by one group's duration (they all run in parallel), while
  //    total throughput scales with however many tokens exist.
  const updatedUsernames: string[] = [];
  // Guard against the (unlikely) case of zero available tokens — fall back to
  // a single worker with no explicit token, which still works via
  // getGitHubHeaders()'s existing cookie/pool/system fallback chain.
  const workerTokens: Array<string | undefined> = tokens.length > 0 ? tokens : [undefined];
  const groups: string[][] = workerTokens.map(() => []);
  targetsUsernames.forEach((username, i) => {
    groups[i % workerTokens.length].push(username);
  });

  const tickStart = Date.now();

  await Promise.all(
    groups.map(async (group, groupIndex) => {
      const token = workerTokens[groupIndex];
      for (const username of group) {
        if (Date.now() - tickStart > TICK_DEADLINE_MS) {
          console.log(`Worker ${groupIndex} hit the tick deadline — stopping; remaining students stay stale for the next tick.`);
          break;
        }
        try {
          await refreshStudentCache(username, token);
          updatedUsernames.push(username);
        } catch (err: any) {
          if (err instanceof NotFoundError || err.name === 'NotFoundError') {
            console.error(`Removing invalid GitHub ID from tracking: ${username}`);
            await removeStudent(username);
            // We consider it "updated" so it gets removed from the refresh queue
            updatedUsernames.push(username);
          } else if (err instanceof InvalidTokenError) {
            // Only reachable when `token` was explicitly passed (see
            // githubSearch/getStudentProfile/validateNewRepos) — the
            // system/cookie/pool fallback path never throws this.
            if (token) {
              console.warn(`Token for worker ${groupIndex} was rejected — evicting and stopping this worker for the tick.`);
              await removePoolToken(token);
            }
            break; // remaining students in this group stay stale, retried next tick by another worker
          } else {
            console.error(`Failed to refresh cache for ${username}:`, err);
            // Do NOT write a fallback cache on Rate Limit or network errors.
            // It will remain stale and get retried in the next batch automatically.
          }
        }
        // Pace requests within this token's own group — each group uses a
        // distinct token, so groups don't compete for the same rate-limit budget.
        await new Promise((r) => setTimeout(r, PACING_MS_PER_STUDENT));
      }
    })
  );

  // 5. Update the queue in KV by removing the successfully processed users
  if (validQueue.length > 0) {
    const processedSet = new Set(updatedUsernames.map(u => u.toLowerCase()));
    const remainingQueue = validQueue.filter(username => !processedSet.has(username.toLowerCase()));
    try {
      await kvSet('refresh_queue', remainingQueue);
    } catch (err) {
      console.error('Failed to update refresh_queue KV after stale processing:', err);
    }
  }

  return { updated: updatedUsernames, attempted: targetsUsernames };
}
