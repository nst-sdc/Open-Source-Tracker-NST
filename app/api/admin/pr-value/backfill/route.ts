import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getStudentsKV } from '@/lib/kv-students';
import { readProfileCache, writeProfileCache, carryForwardContributions } from '@/lib/profile-cache';
import { getRepoCache } from '@/lib/repo-cache';
import { measurePRContributions } from '@/lib/github';
import { PR_VALUE_VERSION } from '@/lib/pr-value';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Wall-clock budget per call, under the tunnel's ~100s cut-off. */
const BUDGET_MS = 70_000;

/**
 * POST /api/admin/pr-value/backfill?cursor=0&limit=20
 *
 * Measures contribution values for merged PRs that still lack one (or carry
 * an older rule version), walking the roster from `cursor`, at most `limit`
 * students measured per call, within a time budget. The normal refresh does
 * the same a few PRs at a time; this is for the day a rule changes or the
 * feature first ships, so values do not take days to fill in. Each call
 * returns the next cursor; call again until `done`. Students without a
 * cache, or with nothing left to measure, cost one KV read and are skipped.
 */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const cursor = Math.max(0, Number(url.searchParams.get('cursor') ?? 0) || 0);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20) || 20));
  const started = Date.now();

  const students = await getStudentsKV();
  const repoCache = await getRepoCache();
  let i = cursor;
  let skipped = 0;
  let measuredStudents = 0;
  let measuredPRs = 0;
  let rateLimited = false;
  const touched: string[] = [];
  // Students with pending PRs the measurer could not value at all: a gone or
  // renamed repository, a PR too large to list. They are reported, not retried.
  const stuck: string[] = [];
  let zerosInARow = 0;

  for (; i < students.length; i++) {
    if (Date.now() - started > BUDGET_MS || measuredStudents >= limit) break;
    const login = students[i].github;
    const cached = await readProfileCache(login);
    if (!cached) { skipped++; continue; }
    const prs = cached.prs;
    const missing = carryForwardContributions(prs, cached);
    const pending = prs.filter((pr) => pr.pull_request?.merged_at && (!pr.contribution || pr.contribution.v !== PR_VALUE_VERSION) && pr.repository_url && repoCache[pr.repository_url.replace('https://api.github.com/repos/', '')]?.valid !== false);
    if (missing === 0 || pending.length === 0) { skipped++; continue; }
    // Drop stale-version values so the measurer sees them as unmeasured.
    for (const pr of pending) if (pr.contribution && pr.contribution.v !== PR_VALUE_VERSION) delete pr.contribution;
    const n = await measurePRContributions(prs, repoCache, undefined, { max: 300 });
    if (n === 0) {
      // Nothing measured although something was pending. One such student is
      // their own problem (the backfill once sat on one for a day, reporting a
      // rate limit); several in a row is the rate limit, so stop and let the
      // caller retry this cursor later.
      stuck.push(login);
      if (++zerosInARow >= 3) { rateLimited = true; break; }
      continue;
    }
    zerosInARow = 0;
    measuredPRs += n;
    measuredStudents++;
    touched.push(login);
    await writeProfileCache(login, cached.profile, prs, cached.issues);
  }

  const done = i >= students.length && !rateLimited;
  return NextResponse.json({
    cursor,
    nextCursor: i,
    total: students.length,
    skipped,
    measuredStudents,
    measuredPRs,
    touched,
    stuck,
    rateLimited,
    done,
    elapsedMs: Date.now() - started,
  });
}
