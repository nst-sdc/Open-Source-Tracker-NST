import { getAllStudentSummaries, buildDateQuery } from '@/lib/github';
import { readSummaryCache, writeSummaryCache } from '@/lib/summary-cache';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // A stampede on a stale cache triggers a full multi-student GitHub refresh.
  const limited = await checkRateLimit(`rl:weekly:${getClientIp(request)}`, 20, 60);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);

  try {
    // Attempt to load from the 'week' summary cache
    let cache = await readSummaryCache('week');

    // 'week' has a rolling date boundary that drifts as time passes — a cache
    // older than an hour may still be showing PRs that have since aged out of
    // the window, so treat it the same as missing.
    const MAX_CACHE_AGE_MS = 60 * 60 * 1000;
    if (cache && Date.now() - new Date(cache.cachedAt).getTime() >= MAX_CACHE_AGE_MS) {
      cache = null;
    }

    if (!cache) {
      const flaggedPRIds = await getFlaggedPRIdSet();
      const dateQuery = buildDateQuery('week');
      const summaries = await getAllStudentSummaries(dateQuery, flaggedPRIds);
      await writeSummaryCache(summaries, 'week');
      cache = { cachedAt: new Date().toISOString(), summaries };
    }

    const contributors = cache.summaries.map((s) => ({
      username: s.profile.login,
      name: s.profile.name ?? s.profile.login,
      avatarUrl: s.profile.avatar_url,
      mergedCount: s.mergedPRs,
      totalCount: s.totalPRs,
      issuesCount: s.issuesCount,
    }));

    return Response.json({ contributors });
  } catch (error) {
    console.error('Error fetching weekly contributors:', error);
    return Response.json({ contributors: [] });
  }
}
