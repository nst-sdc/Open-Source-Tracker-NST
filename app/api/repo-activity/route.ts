import { getGitHubHeaders } from '@/lib/github';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';

interface RepoInfo {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  url: string;
}

// In-memory cache for speed optimization
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

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

export async function GET(request: Request) {
  // Uncached hits fan out to several GitHub REST calls per repo.
  const limited = await checkRateLimit(`rl:repo-activity:${getClientIp(request)}`, 30, 60);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);

  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo');
  const period = searchParams.get('period') || '1day';

  if (!repo || !repo.includes('/')) {
    return Response.json({ error: 'Valid repository parameter (owner/repo) is required.' }, { status: 400 });
  }

  const [owner, repoName] = repo.split('/');
  const filterDate = getFilterDate(period);

  // Check server-side cache
  const cacheKey = `${owner.toLowerCase()}/${repoName.toLowerCase()}:${period}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return Response.json(cached.data);
  }

  try {
    const headers = await getGitHubHeaders();

    // 1. Fetch Repository Info
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers,
      next: { revalidate: 3600 },
    });

    if (!repoRes.ok) {
      if (repoRes.status === 403 || repoRes.status === 429) {
        return Response.json(
          { error: 'GitHub API rate limit exceeded. Please try again later or add a GITHUB_TOKEN to .env.local.' },
          { status: 403 }
        );
      }
      if (repoRes.status === 404) {
        return Response.json({ error: `Repository '${repo}' not found on GitHub.` }, { status: 404 });
      }
      return Response.json({ error: 'Failed to fetch repository data.' }, { status: repoRes.status });
    }

    const repoData = await repoRes.json();
    const repoInfo: RepoInfo = {
      fullName: repoData.full_name,
      description: repoData.description,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      openIssues: repoData.open_issues_count,
      url: repoData.html_url,
    };

    // 2. Fetch Collaborators to identify maintainers (ignore failures if token lacks repo admin/write permissions)
    const maintainers = new Set<string>();
    maintainers.add(owner.toLowerCase()); // The owner is always a maintainer

    try {
      const collabRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/collaborators?affiliation=all&per_page=100`, {
        headers,
        next: { revalidate: 3600 },
      });
      if (collabRes.ok) {
        const collaborators = await collabRes.json();
        if (Array.isArray(collaborators)) {
          for (const collab of collaborators) {
            if (collab.permissions?.push || collab.permissions?.admin) {
              maintainers.add(collab.login.toLowerCase());
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Could not parse collaborators for ${owner}/${repoName}:`, err);
    }

    // 3. Paginated Pull Requests fetching in parallel
    const MAX_PAGES = 5;
    const prPromises = Array.from({ length: MAX_PAGES }, (_, i) => {
      const pageNum = i + 1;
      return fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls?state=all&per_page=100&page=${pageNum}&sort=created&direction=desc`, {
        headers,
        next: { revalidate: 600 },
      }).then(async (res) => {
        if (!res.ok) {
          if (res.status === 403 || res.status === 429) {
            throw new Error('RATE_LIMIT');
          }
          return [];
        }
        return res.json();
      });
    });

    // 4. Paginated Issues fetching in parallel
    const issuePromises = Array.from({ length: MAX_PAGES }, (_, i) => {
      const pageNum = i + 1;
      return fetch(`https://api.github.com/repos/${owner}/${repoName}/issues?state=all&per_page=100&page=${pageNum}&sort=created&direction=desc`, {
        headers,
        next: { revalidate: 600 },
      }).then(async (res) => {
        if (!res.ok) {
          if (res.status === 403 || res.status === 429) {
            throw new Error('RATE_LIMIT');
          }
          return [];
        }
        return res.json();
      });
    });

    let prsPages: any[][];
    let issuesPages: any[][];

    try {
      [prsPages, issuesPages] = await Promise.all([
        Promise.all(prPromises),
        Promise.all(issuePromises)
      ]);
    } catch (err: any) {
      if (err.message === 'RATE_LIMIT') {
        return Response.json(
          { error: 'GitHub API rate limit exceeded. Please try again in a minute.' },
          { status: 403 }
        );
      }
      throw err;
    }

    // Process pull requests pages in-order to respect the time period filter
    const pullRequests: any[] = [];
    for (const pageData of prsPages) {
      if (!Array.isArray(pageData) || pageData.length === 0) break;
      const filtered = pageData.filter(pr => new Date(pr.created_at) > filterDate);
      pullRequests.push(...filtered);
      if (filtered.length < pageData.length) {
        break; // Stop parsing older pages
      }
    }

    // Process issues pages in-order to respect the time period filter
    const issues: any[] = [];
    for (const pageData of issuesPages) {
      if (!Array.isArray(pageData) || pageData.length === 0) break;
      const pureIssues = pageData.filter(item => !item.pull_request);
      const filtered = pureIssues.filter(issue => new Date(issue.created_at) > filterDate);
      issues.push(...filtered);

      const lastItem = pageData[pageData.length - 1];
      if (lastItem && new Date(lastItem.created_at) <= filterDate) {
        break; // Stop parsing older pages
      }
    }

    // 5. Process and group contributors activity
    const contributorMap = new Map<string, {
      username: string;
      avatarUrl: string;
      prsCount: number;
      mergedPRs: number;
      openPRs: number;
      closedPRs: number;
      issuesCount: number;
      isMaintainer: boolean;
      prs: any[];
      issues: any[];
    }>();

    const getOrCreateContributor = (login: string, avatarUrl: string) => {
      const lowerLogin = login.toLowerCase();
      if (!contributorMap.has(lowerLogin)) {
        contributorMap.set(lowerLogin, {
          username: login,
          avatarUrl,
          prsCount: 0,
          mergedPRs: 0,
          openPRs: 0,
          closedPRs: 0,
          issuesCount: 0,
          isMaintainer: maintainers.has(lowerLogin),
          prs: [],
          issues: [],
        });
      }
      return contributorMap.get(lowerLogin)!;
    };

    // Process PRs
    for (const pr of pullRequests) {
      const login = pr.user?.login || 'unknown-user';
      const avatarUrl = pr.user?.avatar_url || 'https://github.com/identicons/placeholder.png';
      const c = getOrCreateContributor(login, avatarUrl);
      c.prsCount++;
      if (pr.merged_at) {
        c.mergedPRs++;
      } else if (pr.state === 'open') {
        c.openPRs++;
      } else {
        c.closedPRs++;
      }
      c.prs.push({
        number: pr.number,
        title: pr.title || `Pull Request #${pr.number}`,
        url: pr.html_url || '',
        state: pr.state || 'unknown',
        createdAt: pr.created_at,
        mergedAt: pr.merged_at || null,
      });
    }

    // Process Issues
    for (const issue of issues) {
      const login = issue.user?.login || 'unknown-user';
      const avatarUrl = issue.user?.avatar_url || 'https://github.com/identicons/placeholder.png';
      const c = getOrCreateContributor(login, avatarUrl);
      c.issuesCount++;
      c.issues.push({
        number: issue.number,
        title: issue.title || `Issue #${issue.number}`,
        url: issue.html_url || '',
        state: issue.state || 'unknown',
        createdAt: issue.created_at,
      });
    }

    // Convert map to array and sort by activity
    const contributors = Array.from(contributorMap.values()).sort((a, b) => {
      if (b.prsCount !== a.prsCount) {
        return b.prsCount - a.prsCount;
      }
      return b.issuesCount - a.issuesCount;
    });

    const responseData = {
      repoInfo,
      contributors,
    };

    // Cache the response
    cache.set(cacheKey, { data: responseData, timestamp: now });

    return Response.json(responseData);
  } catch (error) {
    console.error('Error fetching repo activity:', error);
    return Response.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}


