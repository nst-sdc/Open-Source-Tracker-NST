import { getGitHubHeaders } from '@/lib/github';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';
import { deriveMaintainers, fetchRecentMergers, isBotAccount, MAINTAINER_ASSOCIATIONS } from '@/lib/repo-maintainers';

interface RepoInfo {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  url: string;
}

const monthOf = (iso: string) => iso.slice(0, 7);

/** The parts of GitHub's list-endpoint items this route reads. */
interface GhUser { login?: string; avatar_url?: string; type?: string }
interface GhPR { number: number; title?: string; html_url?: string; state?: string; created_at: string; merged_at?: string | null; user?: GhUser; author_association?: string }
interface GhIssue { number: number; title?: string; html_url?: string; state?: string; created_at: string; user?: GhUser; author_association?: string; pull_request?: unknown }

// In-memory cache for speed optimization
const cache = new Map<string, { data: unknown; timestamp: number }>();
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

    // 2. Who has merge access. Several readable signals, united in
    //    lib/repo-maintainers.ts; the collaborators endpoint below is the
    //    weakest (needs push access to read), the mergers the strongest.
    const collaboratorLogins = new Set<string>();
    const [publicMembers, mergers] = await Promise.all([
      fetch(`https://api.github.com/orgs/${owner}/public_members?per_page=100`, { headers, next: { revalidate: 3600 } })
        .then(async (r) => (r.ok ? ((await r.json()) as Array<{ login: string }>).map((m) => m.login) : []))
        .catch(() => [] as string[]),
      fetchRecentMergers(owner, repoName, headers),
    ]);

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
              collaboratorLogins.add(collab.login.toLowerCase());
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

    let prsPages: GhPR[][];
    let issuesPages: GhIssue[][];

    try {
      [prsPages, issuesPages] = await Promise.all([
        Promise.all(prPromises),
        Promise.all(issuePromises)
      ]);
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMIT') {
        return Response.json(
          { error: 'GitHub API rate limit exceeded. Please try again in a minute.' },
          { status: 403 }
        );
      }
      throw err;
    }

    // Process pull requests pages in-order to respect the time period filter
    const pullRequests: GhPR[] = [];
    for (const pageData of prsPages) {
      if (!Array.isArray(pageData) || pageData.length === 0) break;
      const filtered = pageData.filter(pr => new Date(pr.created_at) > filterDate);
      pullRequests.push(...filtered);
      if (filtered.length < pageData.length) {
        break; // Stop parsing older pages
      }
    }

    // Process issues pages in-order to respect the time period filter
    const issues: GhIssue[] = [];
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

    const maintainers = deriveMaintainers({
      owner,
      collaborators: collaboratorLogins,
      publicMembers,
      mergers: mergers ?? [],
      associations: [...pullRequests, ...issues].map((x) => ({ login: x.user?.login ?? '', association: x.author_association })),
    });

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
      isBot: boolean;
      prs: Array<{ number: number; title: string; url: string; state: string; createdAt: string; mergedAt: string | null }>;
      issues: Array<{ number: number; title: string; url: string; state: string; createdAt: string }>;
    }>();

    const getOrCreateContributor = (login: string, avatarUrl: string, user?: GhUser, association?: string) => {
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
          isBot: isBotAccount(user),
          prs: [],
          issues: [],
        });
      }
      const c = contributorMap.get(lowerLogin)!;
      if (association && MAINTAINER_ASSOCIATIONS.has(association)) c.isMaintainer = true;
      return c;
    };

    // Monthly series for the chart: distinct community contributors (not
    // maintainers, not bots) with a PR opened that month, plus PR and issue
    // volume. Built after the loop below because maintainer status can be
    // learned from a later PR than the one being counted.
    const monthlyAuthors = new Map<string, Set<string>>();
    const monthlyCounts = new Map<string, { opened: number; merged: number; issues: number }>();
    const bump = (m: string, k: 'opened' | 'merged' | 'issues') => {
      const row = monthlyCounts.get(m) ?? { opened: 0, merged: 0, issues: 0 };
      row[k]++;
      monthlyCounts.set(m, row);
    };

    // Process PRs
    for (const pr of pullRequests) {
      const login = pr.user?.login || 'unknown-user';
      const avatarUrl = pr.user?.avatar_url || 'https://github.com/identicons/placeholder.png';
      const c = getOrCreateContributor(login, avatarUrl, pr.user, pr.author_association);
      c.prsCount++;
      if (pr.created_at) {
        const m = monthOf(pr.created_at);
        bump(m, 'opened');
        (monthlyAuthors.get(m) ?? monthlyAuthors.set(m, new Set()).get(m)!).add(login.toLowerCase());
      }
      if (pr.merged_at) {
        bump(monthOf(pr.merged_at), 'merged');
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
      const c = getOrCreateContributor(login, avatarUrl, issue.user, issue.author_association);
      c.issuesCount++;
      if (issue.created_at) bump(monthOf(issue.created_at), 'issues');
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

    const excluded = (login: string) => {
      const c = contributorMap.get(login);
      return !c || c.isMaintainer || c.isBot;
    };
    const months = [...new Set([...monthlyCounts.keys(), ...monthlyAuthors.keys()])].sort();
    const monthly = months.map((month) => {
      const authors = monthlyAuthors.get(month) ?? new Set<string>();
      const counts = monthlyCounts.get(month) ?? { opened: 0, merged: 0, issues: 0 };
      return {
        month,
        contributors: [...authors].filter((l) => !excluded(l)).length,
        maintainersActive: [...authors].filter((l) => contributorMap.get(l)?.isMaintainer).length,
        ...counts,
      };
    });
    const oldestPR = pullRequests.length ? pullRequests[pullRequests.length - 1].created_at : null;

    const responseData = {
      repoInfo,
      contributors,
      monthly,
      maintainerSignals: { mergers: mergers === null ? 'unavailable (no token)' : mergers.size, publicMembers: publicMembers.length },
      window: {
        // The list endpoints are read newest-first, MAX_PAGES pages deep, so a
        // busy repo's "all time" is really "the newest N pull requests".
        since: oldestPR,
        prsFetched: pullRequests.length,
        truncated: prsPages.every((p) => Array.isArray(p) && p.length === 100) && period === 'all',
      },
    };

    // Cache the response
    cache.set(cacheKey, { data: responseData, timestamp: now });

    return Response.json(responseData);
  } catch (error) {
    console.error('Error fetching repo activity:', error);
    return Response.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}


