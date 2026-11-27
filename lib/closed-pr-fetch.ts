/**
 * lib/closed-pr-fetch.ts — one GraphQL round trip per closed PR: labels,
 * who closed it, comments, reviews and review threads. Uses the system
 * token through getGitHubHeaders; reports rate limiting so a scan can stop
 * and resume later.
 */
import { getGitHubHeaders } from './github';
import type { PrDetail } from './closed-pr-review';

const QUERY = `query($owner:String!,$name:String!,$number:Int!){ repository(owner:$owner,name:$name){ pullRequest(number:$number){
  state closedAt createdAt additions deletions author{login}
  labels(first:10){nodes{name}}
  timelineItems(itemTypes:[CLOSED_EVENT],last:1){nodes{... on ClosedEvent{actor{login} createdAt}}}
  comments(first:30){nodes{author{login} body createdAt}}
  reviews(first:10){nodes{author{login} state body createdAt}}
  reviewThreads(first:8){nodes{comments(first:2){nodes{author{login} body createdAt}}}}
}}}`;

export type FetchResult = { ok: true; detail: PrDetail } | { ok: false; rateLimited?: boolean; missing?: boolean; error?: string };

export async function fetchClosedPrDetail(repo: string, number: number, token?: string): Promise<FetchResult> {
  const headers = (await getGitHubHeaders(token)) as Record<string, string>;
  if (!headers.Authorization) return { ok: false, error: 'no GitHub token' };
  const [owner, name] = repo.split('/', 2);
  let res: Response;
  try {
    res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { owner, name, number } }),
      cache: 'no-store',
    });
  } catch (err) {
    return { ok: false, error: String(err) };
  }
  if (res.status === 403 || res.status === 429) return { ok: false, rateLimited: true };
  if (!res.ok) return { ok: false, error: `GraphQL answered ${res.status}` };
  const body = (await res.json()) as { data?: { repository?: { pullRequest?: PrDetail | null } | null }; errors?: Array<{ message: string; type?: string }> };
  const pr = body.data?.repository?.pullRequest;
  if (pr) return { ok: true, detail: pr };
  if (body.errors?.some((e) => e.type === 'NOT_FOUND')) return { ok: false, missing: true };
  if (body.errors?.some((e) => /rate limit/i.test(e.message))) return { ok: false, rateLimited: true };
  return { ok: false, missing: !body.errors?.length, error: body.errors?.map((e) => e.message).join(' | ') };
}
