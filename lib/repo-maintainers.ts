/**
 * lib/repo-maintainers.ts
 *
 * Who has merge access in a repository, from signals that are readable
 * without being a member. Each source alone misses people (GitHub hides
 * private org membership from outsiders, so a core maintainer can read as
 * "CONTRIBUTOR"); together they are reliable:
 *
 *   - the repository owner;
 *   - the collaborators endpoint, when the token can read it (rare);
 *   - author_association OWNER / MEMBER / COLLABORATOR on any PR or issue;
 *   - the organisation's public member list;
 *   - whoever merged a recent pull request (GraphQL `mergedBy`): merging is
 *     the one thing only merge access can do, and it cannot be hidden.
 */
export const MAINTAINER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export function deriveMaintainers(input: {
  owner: string;
  collaborators?: Iterable<string>;
  associations?: Iterable<{ login: string; association?: string | null }>;
  publicMembers?: Iterable<string>;
  mergers?: Iterable<string>;
}): Set<string> {
  const out = new Set<string>([input.owner.toLowerCase()]);
  for (const c of input.collaborators ?? []) out.add(c.toLowerCase());
  for (const m of input.publicMembers ?? []) out.add(m.toLowerCase());
  for (const m of input.mergers ?? []) if (m) out.add(m.toLowerCase());
  for (const a of input.associations ?? []) {
    if (a.association && MAINTAINER_ASSOCIATIONS.has(a.association)) out.add(a.login.toLowerCase());
  }
  return out;
}

const BOT_LOGINS = new Set(['dependabot', 'renovate', 'github-actions', 'codecov', 'snyk-bot', 'greenkeeper', 'imgbot', 'allcontributors', 'pre-commit-ci', 'mergify', 'stale', 'copilot', 'copilot-swe-agent']);

export function isBotAccount(user: { login?: string; type?: string } | null | undefined): boolean {
  if (!user?.login) return false;
  if (user.type === 'Bot') return true;
  const l = user.login.toLowerCase();
  return l.endsWith('[bot]') || BOT_LOGINS.has(l);
}

export interface MergeEvent {
  number: number;
  title: string;
  mergedAt: string;
  /** Login of whoever pressed merge. */
  mergedBy: string;
  author: string | null;
}

/**
 * GraphQL: merged pull requests with who merged them, newest updated first.
 * Reads at least `minPages` (so the merger signal for deriveMaintainers is
 * as deep as before whatever the period) and then continues while the page
 * still reaches back to `since`, up to `maxPages`. Needs a token (GraphQL
 * refuses anonymous calls); returns null when it cannot run so the caller
 * knows the signal is missing rather than empty. A later page failing
 * returns what was read.
 */
export async function fetchMergeEvents(
  owner: string,
  repo: string,
  headers: HeadersInit,
  opts: { since?: Date; minPages?: number; maxPages?: number } = {},
): Promise<MergeEvent[] | null> {
  const h = headers as Record<string, string>;
  if (!h.Authorization) return null;
  const minPages = opts.minPages ?? 3;
  const maxPages = Math.max(minPages, opts.maxPages ?? 3);
  const sinceMs = opts.since?.getTime() ?? Number.POSITIVE_INFINITY;
  const out: MergeEvent[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const query = `query($owner:String!,$repo:String!,$after:String){ repository(owner:$owner,name:$repo){ pullRequests(states:[MERGED],first:100,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){ pageInfo{hasNextPage endCursor} nodes{ number title mergedAt updatedAt mergedBy{login} author{login} } } } }`;
    let res: Response;
    try {
      res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { owner, repo, after: cursor } }),
        cache: 'no-store',
      });
    } catch {
      return i === 0 ? null : out;
    }
    if (!res.ok) return i === 0 ? null : out;
    const data = (await res.json()) as {
      data?: { repository?: { pullRequests?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<{ number: number; title: string; mergedAt: string; updatedAt: string; mergedBy: { login: string } | null; author: { login: string } | null }> } } };
    };
    const prs = data.data?.repository?.pullRequests;
    if (!prs) return i === 0 ? null : out;
    let oldestUpdated = Number.POSITIVE_INFINITY;
    for (const n of prs.nodes) {
      if (n.mergedBy?.login) out.push({ number: n.number, title: n.title, mergedAt: n.mergedAt, mergedBy: n.mergedBy.login, author: n.author?.login ?? null });
      const u = new Date(n.updatedAt).getTime();
      if (u < oldestUpdated) oldestUpdated = u;
    }
    if (!prs.pageInfo.hasNextPage) break;
    // Anything merged after `since` was updated after it too, so once a page
    // ends before `since` no later page can hold a merge in the window.
    if (i + 1 >= minPages && oldestUpdated < sinceMs) break;
    cursor = prs.pageInfo.endCursor;
  }
  return out;
}

/** The mergers of the newest merged pull requests, lowercased; see fetchMergeEvents. */
export async function fetchRecentMergers(
  owner: string,
  repo: string,
  headers: HeadersInit,
  pages = 3,
): Promise<Set<string> | null> {
  const events = await fetchMergeEvents(owner, repo, headers, { minPages: pages, maxPages: pages });
  return events === null ? null : new Set(events.map((e) => e.mergedBy.toLowerCase()));
}
