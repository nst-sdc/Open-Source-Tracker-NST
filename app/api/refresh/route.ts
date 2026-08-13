import {
  getAllStudentSummaries,
  getStudentProfile,
  getStudentPRs,
  getStudentIssues,
  buildDateQuery,
  getSummaryFromCache,
  GitHubRateLimitError,
} from '@/lib/github';
import { getStudentsKV } from '@/lib/kv-students';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import {
  readSummaryCache,
  writeSummaryCache,
  isCacheFresh,
  REFRESH_COOLDOWN_MS,
} from '@/lib/summary-cache';
import { readProfileCache, writeProfileCache } from '@/lib/profile-cache';
import { getRepoCache } from '@/lib/repo-cache';
import { getExceptionRepoSetForUser } from '@/lib/kv-own-repo-exceptions';
import { kvGet, kvSet } from '@/lib/kv';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/** Returns true if the current request has a valid GitHub OAuth token (i.e. a logged-in user). */
async function isLoggedIn(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    return !!cookieStore.get('github_oauth_token')?.value;
  } catch {
    return false;
  }
}

/**
 * GET /api/refresh
 * Returns current cache metadata (age, count) without triggering a refresh.
 * Supports ?period=xxx and ?username=xxx
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  const period = url.searchParams.get('period') || 'all';

  if (username) {
    const cached = await readProfileCache(username);
    if (!cached) {
      return Response.json({ cachedAt: null, fresh: false });
    }
    const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
    // 1 hour fresh TTL
    const isFresh = ageMs < 60 * 60 * 1000;
    return Response.json({
      cachedAt: cached.cachedAt,
      fresh: isFresh,
    });
  }

  const cache = await readSummaryCache(period);
  if (!cache) {
    return Response.json({ cachedAt: null, fresh: false, count: 0 });
  }
  return Response.json({
    cachedAt: cache.cachedAt,
    fresh: isCacheFresh(cache),
    count: cache.summaries.length,
    cooldownMs: REFRESH_COOLDOWN_MS,
  });
}

/**
 * POST /api/refresh
 * Public endpoint — rate-limited to once every 5 minutes.
 * Re-fetches the requested profile or period summary cache.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  const period = url.searchParams.get('period') || 'all';

  // 1. Refresh individual profile
  if (username) {
    const cached = await readProfileCache(username);
    const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours manual refresh cooldown for anonymous users
    const loggedIn = await isLoggedIn();

    // Only apply cooldown for anonymous (non-authenticated) users
    if (cached && !loggedIn) {
      const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
      if (ageMs < COOLDOWN_MS) {
        const remainingMins = Math.ceil((COOLDOWN_MS - ageMs) / (60 * 1000));
        return Response.json({
          ok: true,
          fromCache: true,
          cachedAt: cached.cachedAt,
          message: `Profile was refreshed recently. Next refresh allowed in ${remainingMins} minutes.`,
        });
      }
    }

    try {
      // Fetch fresh profile data
      const profile = await getStudentProfile(username);
      if (!profile) {
        return Response.json({ error: 'User not found' }, { status: 404 });
      }

      const [prs, issues] = await Promise.all([
        getStudentPRs(username),
        getStudentIssues(username),
      ]);

      if (prs === null || issues === null) {
        throw new Error('Failed to fetch contributions from GitHub');
      }

      await writeProfileCache(username, profile, prs, issues);

      // Patch just this student's entry in every summary cache period
      // This is O(1) — no need to rebuild all 600+ profiles from scratch.
      try {
        const flaggedPRIds = await getFlaggedPRIdSet();
        const repoCache = await getRepoCache();
        const updatedCache = await readProfileCache(username);
        const students = await getStudentsKV();
        const student = students.find(
          (s) => s.github.toLowerCase() === username.toLowerCase()
        );

        if (updatedCache) {
          const ownRepoExceptions = await getExceptionRepoSetForUser(username);
          const periods = ['all', 'week', 'month'];
          for (const p of periods) {
            const existingCache = await readSummaryCache(p);
            if (existingCache) {
              const dateQuery = buildDateQuery(p);
              const freshSummary = getSummaryFromCache(updatedCache, dateQuery, flaggedPRIds, repoCache, ownRepoExceptions);
              if (student) {
                freshSummary.year = student.year;
                freshSummary.campus = student.campus;
              }
              // Replace the existing entry or append if not present
              const idx = existingCache.summaries.findIndex(
                (s) => s.profile.login.toLowerCase() === username.toLowerCase()
              );
              if (idx !== -1) {
                existingCache.summaries[idx] = freshSummary;
              } else {
                existingCache.summaries.push(freshSummary);
              }
              // Re-sort by score descending
              existingCache.summaries.sort((a, b) => b.scoreMergedPRs - a.scoreMergedPRs);
              await writeSummaryCache(existingCache.summaries, p);
            }
          }
        }
        revalidatePath('/contributors');
        revalidatePath('/');
      } catch (err) {
        console.error('Failed to patch summary caches after individual refresh:', err);
      }

      revalidatePath(`/contributors/${username}`);

      return Response.json({
        ok: true,
        fromCache: false,
        cachedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      const isRateLimit = err.name === 'GitHubRateLimitError' || err instanceof GitHubRateLimitError;

      if (isRateLimit) {
        console.warn(`[Refresh API] Rate limit hit for @${username}. Queuing update. Error:`, err.message);
        try {
          const queue = await kvGet<string[]>('refresh_queue') || [];
          if (!queue.some(u => u.toLowerCase() === username.toLowerCase())) {
            queue.push(username);
            await kvSet('refresh_queue', queue);
          }
        } catch (kvErr) {
          console.error('Failed to add user to refresh_queue KV:', kvErr);
        }

        return Response.json({
          ok: false,
          rateLimited: true,
          message: 'GitHub rate limit exceeded. We have queued your profile to update automatically in the background shortly.',
        });
      }

      console.error(`[Refresh API] Error refreshing @${username}:`, err);
      return Response.json(
        { ok: false, error: err.message || 'Failed to fetch updates from GitHub' },
        { status: 500 }
      );
    }
  }

  // 2. Refresh summaries list for a specific period
  const cache = await readSummaryCache(period);
  const summaryLoggedIn = await isLoggedIn();

  // Rate limit: return early if cache is still fresh (skip for logged-in users)
  if (cache && isCacheFresh(cache) && !summaryLoggedIn) {
    const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
    const remainingSecs = Math.ceil((REFRESH_COOLDOWN_MS - ageMs) / 1000);
    return Response.json({
      ok: true,
      fromCache: true,
      cachedAt: cache.cachedAt,
      message: `Cache is fresh. Try again in ${remainingSecs}s.`,
    });
  }

  // Fetch fresh summaries from cached profile data (zero live GitHub search queries)
  const flaggedPRIds = await getFlaggedPRIdSet();
  const dateQuery = buildDateQuery(period);
  const summaries = await getAllStudentSummaries(dateQuery, flaggedPRIds, false);
  await writeSummaryCache(summaries, period);

  // Tell Next.js to re-render the pages
  revalidatePath('/contributors');
  revalidatePath('/');

  return Response.json({ ok: true, fromCache: false, cachedAt: new Date().toISOString() });
}
