import { getGitHubHeaders } from '@/lib/github';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';

function getFilterDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case '1day':    return new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    case 'week':    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':   return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '2months': return new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    case '3months': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:        return new Date(0); // All time
  }
}

// In-memory cache for user activity details
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache for user stats

export async function GET(request: Request) {
  // Each uncached hit spends a GitHub Search call from the shared quota.
  const limited = await checkRateLimit(`rl:user-activity:${getClientIp(request)}`, 30, 60);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);

  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const period = searchParams.get('period') || '1day';

  if (!username) {
    return Response.json({ error: 'Username parameter is required.' }, { status: 400 });
  }

  const cacheKey = `${username.toLowerCase()}:${period}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return Response.json(cached.data);
  }

  try {
    const headers = await getGitHubHeaders();
    const filterDate = getFilterDate(period);

    // Fetch user public PRs across all repos
    const searchRes = await fetch(
      `https://api.github.com/search/issues?q=author:${username}+is:pr&per_page=100&sort=created&order=desc`,
      {
        headers,
        next: { revalidate: 600 },
      }
    );

    if (!searchRes.ok) {
      if (searchRes.status === 403 || searchRes.status === 429) {
        return Response.json({ error: 'Search rate limit exceeded. Please try again shortly.' }, { status: 403 });
      }
      return Response.json({ error: 'Failed to fetch user activity from GitHub.' }, { status: searchRes.status });
    }

    const data = await searchRes.json();
    const items = data.items || [];

    // Filter by period
    const filteredPRs = items.filter((item: any) => new Date(item.created_at) > filterDate);

    // Group PRs by repository name
    const reposMap = new Map<string, {
      repoName: string;
      totalPRs: number;
      mergedPRs: number;
      openPRs: number;
      closedPRs: number;
    }>();

    const getOrCreateRepoStats = (repoName: string) => {
      if (!reposMap.has(repoName)) {
        reposMap.set(repoName, {
          repoName,
          totalPRs: 0,
          mergedPRs: 0,
          openPRs: 0,
          closedPRs: 0
        });
      }
      return reposMap.get(repoName)!;
    };

    const pullRequests: any[] = [];

    for (const pr of filteredPRs) {
      // Parse repository name from repository_url: "https://api.github.com/repos/owner/repo"
      const repoUrl = pr.repository_url || '';
      const parts = repoUrl.split('/repos/');
      const repoName = parts.length > 1 ? parts[1] : 'unknown/repo';

      const stats = getOrCreateRepoStats(repoName);
      stats.totalPRs++;

      const isMerged = pr.pull_request?.merged_at || pr.merged_at || false;
      if (isMerged) {
        stats.mergedPRs++;
      } else if (pr.state === 'open') {
        stats.openPRs++;
      } else {
        stats.closedPRs++;
      }

      pullRequests.push({
        number: pr.number,
        title: pr.title || `Pull Request #${pr.number}`,
        url: pr.html_url || '',
        state: pr.state || 'unknown',
        createdAt: pr.created_at,
        mergedAt: pr.pull_request?.merged_at || pr.merged_at || null,
        repoName,
      });
    }

    const repositories = Array.from(reposMap.values()).sort((a, b) => b.totalPRs - a.totalPRs);

    const responseData = {
      username,
      repositories,
      pullRequests,
    };

    // Cache results
    cache.set(cacheKey, { data: responseData, timestamp: now });

    return Response.json(responseData);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    return Response.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
