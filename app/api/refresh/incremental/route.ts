import { NextResponse } from 'next/server';
import { updateStaleProfiles, buildDateQuery, getSummaryFromCache } from '@/lib/github';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import { writeSummaryCache, readSummaryCache } from '@/lib/summary-cache';
import { readProfileCache } from '@/lib/profile-cache';
import { readOrgIndex, writeOrgIndex, indexStudentContributions } from '@/lib/org-index';
import { getRepoCache } from '@/lib/repo-cache';
import { getStudentsKV } from '@/lib/kv-students';
import { getOwnRepoExceptions, buildOwnRepoExceptionMap, EMPTY_REPO_SET } from '@/lib/kv-own-repo-exceptions';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
// Batch size auto-scales with the number of available GitHub tokens (system +
// pool), each processed concurrently — this bounds wall-clock time per tick
// regardless of pool size, so give it real headroom under the platform's
// serverless timeout.
export const maxDuration = 180;

async function performIncrementalRefresh() {
  // 1. Refresh stale profiles — batch size auto-scales with how many GitHub
  //    tokens are currently available (cursor-based round-robin, O(1) KV reads)
  console.log('[Incremental Refresh] Starting stale profile updates...');
  const { updated, attempted } = await updateStaleProfiles();
  console.log('[Incremental Refresh] Updated users:', updated, 'Attempted users:', attempted);

  if (attempted.length === 0) {
    return { ok: true, updatedUsers: [], attemptedUsers: [], message: 'All profiles are fresh. Nothing to update.' };
  }

  // 2. Patch ONLY the updated students in every summary cache period (O(n) where n=updated.length)
  //    This avoids reading all 1914+ profiles on every cron run.
  console.log('[Incremental Refresh] Patching summary caches for updated users...');
  const flaggedPRIds = await getFlaggedPRIdSet();
  const repoCache = await getRepoCache();
  const students = await getStudentsKV();
  const ownRepoExceptionMap = buildOwnRepoExceptionMap(await getOwnRepoExceptions());
  const periods = ['all', 'week', 'month'];

  // Every period is derived from the SAME profile cache -- getSummaryFromCache
  // just filters that student's PRs by the period's date cutoff. Reading the
  // profile inside the period loop therefore fetched identical bytes from KV
  // three times per student per tick, which at the default batch size was
  // ~288,000 redundant Upstash commands a month: about 61% of the free tier
  // spent re-downloading data already in memory. Read each profile once.
  const profiles = new Map<string, NonNullable<Awaited<ReturnType<typeof readProfileCache>>>>();
  for (const username of updated) {
    const cached = await readProfileCache(username);
    if (cached) profiles.set(username.toLowerCase(), cached);
  }

  // The org filter's index is derived from these same profiles, so it is built
  // here rather than per request: no extra GitHub calls, no extra KV reads, and
  // it populates whether or not anyone has searched -- which is what the
  // previous lazy-write approach could never do.
  const orgIndex = await readOrgIndex();
  for (const [lowerName, profile] of profiles) {
    const login = students.find(s => s.github.toLowerCase() === lowerName)?.github ?? lowerName;
    indexStudentContributions(orgIndex, login, profile, {
      flaggedPRIds,
      isRepoValid: (repo) => repoCache[repo]?.valid !== false,
    });
  }
  await writeOrgIndex(orgIndex);
  console.log(`[Incremental Refresh] org index covers ${Object.keys(orgIndex).length} organisations`);

  for (const period of periods) {
    // bypassMemory: the loop below mutates existingCache.summaries in place
    // before writing it back, so it must not share the cached instance.
    const existingCache = await readSummaryCache(period, { bypassMemory: true });
    if (!existingCache) continue;

    const dateQuery = buildDateQuery(period);
    let changed = false;

    for (const username of updated) {
      const updatedCache = profiles.get(username.toLowerCase());
      if (!updatedCache) continue;

      const student = students.find(s => s.github.toLowerCase() === username.toLowerCase());
      const ownRepoExceptions = ownRepoExceptionMap.get(username.toLowerCase()) ?? EMPTY_REPO_SET;
      const freshSummary = getSummaryFromCache(updatedCache, dateQuery, flaggedPRIds, repoCache, ownRepoExceptions);
      if (student) {
        freshSummary.year = student.year;
        freshSummary.campus = student.campus;
      }

      const idx = existingCache.summaries.findIndex(
        s => s.profile.login.toLowerCase() === username.toLowerCase()
      );
      if (idx !== -1) {
        existingCache.summaries[idx] = freshSummary;
      } else {
        existingCache.summaries.push(freshSummary);
      }
      changed = true;
    }

    if (changed) {
      existingCache.summaries.sort((a, b) => b.scoreMergedPRs - a.scoreMergedPRs);
      await writeSummaryCache(existingCache.summaries, period);
      console.log(`[Incremental Refresh] Patched summary cache for period: ${period}`);
    }
  }

  // 3. Revalidate Next.js pages
  revalidatePath('/contributors');
  revalidatePath('/');
  console.log('[Incremental Refresh] Next.js paths revalidated.');

  return {
    ok: true,
    updatedUsers: updated,
    attemptedUsers: attempted,
    message: `Successfully refreshed cache for: ${updated.join(', ')}`,
  };
}

export async function POST() {
  try {
    const result = await performIncrementalRefresh();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Incremental Refresh] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await performIncrementalRefresh();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Incremental Refresh] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
