import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getStudentsKV } from '@/lib/kv-students';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import { getRepoCache, prExcludedBy } from '@/lib/repo-cache';
import { makeRepoMultiplierResolver } from '@/lib/github';
import { getOwnRepoExceptions, buildOwnRepoExceptionMap, EMPTY_REPO_SET } from '@/lib/kv-own-repo-exceptions';
import { buildCommunityTimeline, readCommunityTimeline, writeCommunityTimeline, seriesFor } from '@/lib/community-timeline';

export const dynamic = 'force-dynamic';

/** GET /api/admin/community-timeline — when it was built and the last 12 months, all campuses. */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const t = await readCommunityTimeline();
  return NextResponse.json({ builtAt: t?.builtAt ?? null, studentsCounted: t?.studentsCounted ?? 0, months: seriesFor(t) });
}

/** POST /api/admin/community-timeline — rebuild now from every profile cache. */
export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [students, flaggedPRIds, repoCache, ownRepoExceptionMap] = await Promise.all([
    getStudentsKV(),
    getFlaggedPRIdSet(),
    getRepoCache(),
    getOwnRepoExceptions().then(buildOwnRepoExceptionMap),
  ]);
  const now = Date.now();
  const t = await buildCommunityTimeline(students, (student) => {
    const own = ownRepoExceptionMap.get(student.github.toLowerCase()) ?? EMPTY_REPO_SET;
    return {
      flaggedPRIds,
      excludesPR: (repo, mergedAt) => !own.has(repo.toLowerCase()) && prExcludedBy(repoCache[repo], mergedAt) !== null,
      // Same resolver as the leaderboard, so the chart's impact average matches the badges.
      multiplierFor: makeRepoMultiplierResolver(repoCache, student.github, own, now),
    };
  });
  if (!(await writeCommunityTimeline(t))) return NextResponse.json({ error: 'The store did not accept the timeline.' }, { status: 503 });
  return NextResponse.json({ ok: true, builtAt: t.builtAt, studentsCounted: t.studentsCounted, months: seriesFor(t) });
}
