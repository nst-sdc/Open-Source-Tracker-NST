import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getStudentsKV } from '@/lib/kv-students';
import { readProfileCache } from '@/lib/profile-cache';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import { getRepoCache, prExcludedBy } from '@/lib/repo-cache';
import { getOwnRepoExceptions, buildOwnRepoExceptionMap, EMPTY_REPO_SET } from '@/lib/kv-own-repo-exceptions';
import { classifyClosedPr, summarizeClosedPrs, CLOSED_PR_WINDOW_MONTHS } from '@/lib/closed-pr-review';
import { fetchClosedPrDetail } from '@/lib/closed-pr-fetch';
import { getClosedPrFeedback, knownFeedbackKeys, putClosedPrFeedback } from '@/lib/kv-closed-prs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET  /api/admin/closed-prs                    — the summary (reasons, owners, months, students, flagged quotes).
 * POST /api/admin/closed-prs?cursor=0&limit=40  — scan: walk the roster from `cursor`, fetch GitHub's
 *      comments/reviews/labels/closer for closed-unmerged PRs of the last 12 months that are not
 *      yet stored, classify and store them; at most `limit` PRs per call. Returns the next cursor;
 *      call again until `done`. Stops early when GitHub rate-limits.
 */
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const campus = url.searchParams.get('campus') ?? '';
  const year = url.searchParams.get('year') ?? '';
  const rows = (await getClosedPrFeedback()).filter((r) => (!campus || r.campus === campus) && (!year || r.year === year));
  return NextResponse.json({ summary: summarizeClosedPrs(rows), campus, year });
}

const sinceMonth = (now: Date) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - CLOSED_PR_WINDOW_MONTHS, 1));
  return d.toISOString().slice(0, 7);
};

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const cursor = Math.max(0, Number(url.searchParams.get('cursor') ?? 0) || 0);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 40) || 40));
  const [students, known, flagged, repoCache, ownMap] = await Promise.all([
    getStudentsKV(), knownFeedbackKeys(), getFlaggedPRIdSet(), getRepoCache(), getOwnRepoExceptions().then(buildOwnRepoExceptionMap),
  ]);
  const since = sinceMonth(new Date());
  let i = cursor;
  let fetched = 0;
  let skipped = 0;
  let rateLimited = false;
  const errors: string[] = [];
  const out = [];
  while (i < students.length && fetched < limit && !rateLimited) {
    const s = students[i];
    i++;
    const p = await readProfileCache(s.github).catch(() => null);
    if (!p?.prs?.length) continue;
    const own = ownMap.get(s.github.toLowerCase()) ?? EMPTY_REPO_SET;
    for (const pr of p.prs) {
      if (fetched >= limit || rateLimited) { i--; break; } // come back to this student next call
      const repo = (pr.repository_url ?? '').replace('https://api.github.com/repos/', '');
      const mergedAt = pr.pull_request?.merged_at ?? null;
      if (!repo || mergedAt || pr.state !== 'closed' || !pr.created_at || pr.created_at.slice(0, 7) < since) continue;
      const key = `${repo}#${pr.number}`;
      if (known.has(key)) continue;
      if (flagged.has(key)) continue;
      if (!own.has(repo.toLowerCase()) && prExcludedBy(repoCache[repo], mergedAt) !== null) continue;
      const res = await fetchClosedPrDetail(repo, pr.number);
      if (!res.ok) {
        if (res.rateLimited) { rateLimited = true; break; }
        if (res.missing) { known.add(key); skipped++; continue; }
        errors.push(`${key}: ${res.error}`);
        continue;
      }
      out.push(classifyClosedPr(
        { repo, number: pr.number, url: pr.html_url, title: pr.title, login: s.github, campus: s.campus, year: s.year, createdAt: pr.created_at, closedAt: pr.closed_at },
        res.detail,
      ));
      known.add(key);
      fetched++;
    }
  }
  if (out.length && !(await putClosedPrFeedback(out))) return NextResponse.json({ error: 'The store did not accept the scan results.' }, { status: 503 });
  const done = i >= students.length && !rateLimited;
  return NextResponse.json({ nextCursor: rateLimited ? i : i, total: students.length, fetched, skipped, rateLimited, done, errors: errors.slice(0, 5), stored: known.size });
}
