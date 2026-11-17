/**
 * lib/incremental-refresh.ts
 *
 * One tick of the background refresh: fetch the stalest profiles from GitHub
 * and patch them into every summary cache. Called by the CronJob through
 * POST /api/refresh/incremental in production, and by lib/local-auto-refresh.ts
 * in-process when the app runs locally, so a fresh checkout fills itself in
 * without anyone running a script or reloading.
 */
import { updateStaleProfiles, buildDateQuery, getSummaryFromCache } from '@/lib/github';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import { writeSummaryCache, readSummaryCache, pruneToRoster } from '@/lib/summary-cache';
import { readProfileCache } from '@/lib/profile-cache';
import {
  readOrgIndexForWrite,
  writeOrgIndex,
  indexStudentContributions,
  studentsMissingFromIndex,
  orgIndexRebuiltAt,
  rebuildOrgIndex,
  REBUILD_MIN_INTERVAL_MS,
  type IndexFilters,
} from '@/lib/org-index';
import { getRepoCache, prExcludedBy } from '@/lib/repo-cache';
import type { Student } from '@/lib/kv-students';
import { classifyUnknownOwners } from '@/lib/org-cache';
import { getStudentsKV } from '@/lib/kv-students';
import { getOwnRepoExceptions, buildOwnRepoExceptionMap, EMPTY_REPO_SET } from '@/lib/kv-own-repo-exceptions';
import { revalidatePath } from 'next/cache';

export interface IncrementalRefreshResult {
  ok: true;
  updatedUsers: string[];
  attemptedUsers: string[];
  message: string;
}

export async function performIncrementalRefresh(): Promise<IncrementalRefreshResult> {
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
  // The index must apply the SAME exclusion rule as getSummaryFromCache
  // (flagged PRs, admin own-repo exceptions, prExcludedBy), or the org page
  // and the index disagree about who contributed where.
  const indexFiltersFor = (student: Student): IndexFilters => {
    const own = ownRepoExceptionMap.get(student.github.toLowerCase()) ?? EMPTY_REPO_SET;
    return {
      flaggedPRIds,
      excludesPR: (repo, mergedAt) => !own.has(repo.toLowerCase()) && prExcludedBy(repoCache[repo], mergedAt) !== null,
    };
  };
  const { ok: indexReadOk, index: orgIndex } = await readOrgIndexForWrite();
  if (!indexReadOk) {
    // Folding this tick's students into an empty "index" and writing it back
    // would erase everyone else. Skip; the next tick picks these students up
    // again if their cache is still the stalest, and the rebuild below heals
    // any gap that opens.
    console.error('[Incremental Refresh] org index unreadable this tick; leaving it untouched');
  } else {
    for (const [lowerName, profile] of profiles) {
      const student = students.find(s => s.github.toLowerCase() === lowerName);
      indexStudentContributions(orgIndex, student?.github ?? lowerName, profile, indexFiltersFor(student ?? { github: lowerName }));
    }
    await writeOrgIndex(orgIndex);
    console.log(`[Incremental Refresh] org index covers ${Object.keys(orgIndex).length} organisations`);

    // Self-heal. The index only learns about a student when they are
    // refreshed, so after a wipe it stays partial for weeks. Rebuild from
    // every profile when anyone with counted merged PRs is missing from it,
    // at most every REBUILD_MIN_INTERVAL_MS -- and once unconditionally the
    // first time this code runs, so a deploy repairs an index built under
    // the old, weaker rule.
    const allSummaries = (await readSummaryCache('all'))?.summaries ?? [];
    const missing = studentsMissingFromIndex(orgIndex, allSummaries);
    const lastRebuild = await orgIndexRebuiltAt();
    const dueForRebuild = lastRebuild === null || Date.now() - lastRebuild.getTime() >= REBUILD_MIN_INTERVAL_MS;
    if ((lastRebuild === null || missing.length > 0) && dueForRebuild) {
      console.warn(
        lastRebuild === null
          ? '[Incremental Refresh] first tick with exact org indexing; rebuilding the org index from all profiles'
          : `[Incremental Refresh] org index is missing ${missing.length} students with merged PRs (e.g. ${missing.slice(0, 3).join(', ')}); rebuilding`,
      );
      await rebuildOrgIndex(students, indexFiltersFor);
    }

    // The search box only suggests owners GitHub confirms are organisations.
    // Classify a few unknown ones each tick (most-contributed first) so every
    // org students work with becomes searchable within hours, not only the
    // ones somebody once opened by URL.
    try {
      const c = await classifyUnknownOwners(15);
      if (c.checked > 0 || c.stoppedBy) {
        console.log(`[Incremental Refresh] classified ${c.checked} repo owners (${c.organisations} organisations), ${c.remaining} to go${c.stoppedBy ? `; stopped: ${c.stoppedBy}` : ''}`);
      }
    } catch (err) {
      console.error('[Incremental Refresh] owner classification failed:', err);
    }
  }

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
      // A stale profile of someone no longer on the roster is still refreshed
      // (the queue does not know), but it must not re-enter the leaderboard.
      if (!student) continue;
      const ownRepoExceptions = ownRepoExceptionMap.get(username.toLowerCase()) ?? EMPTY_REPO_SET;
      const freshSummary = getSummaryFromCache(updatedCache, dateQuery, flaggedPRIds, repoCache, ownRepoExceptions);
      freshSummary.year = student.year;
      freshSummary.campus = student.campus;

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

    const pruned = pruneToRoster(existingCache.summaries, students);
    if (pruned.length !== existingCache.summaries.length) {
      existingCache.summaries = pruned;
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
