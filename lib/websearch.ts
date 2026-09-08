/**
 * lib/websearch.ts — web search and page reading, via Parallel's hosted MCP.
 *
 * Endpoint: https://search.parallel.ai/mcp — keyless on the free tier, which
 * is rate-limited per `session_id`. Both of its tools declare
 * `readOnlyHint: true` and `destructiveHint: false`, which matches this
 * codebase's read-only posture exactly.
 *
 * WHY THIS MATTERS FOR SECURITY. The dangerous way to give an agent the web
 * is to let our own server fetch a URL the model composed. That is a
 * server-side request to an attacker-influenced address from a process
 * holding student OAuth tokens — an SSRF primitive into the cluster, and one
 * that cannot be fully closed in Node: validating the hostname and then
 * calling fetch() resolves DNS twice, so a rebinding attack passes the check
 * and then connects somewhere else. Routing every fetch through Parallel
 * removes the primitive entirely, because our server only ever opens a
 * connection to one fixed, known host. There is no URL allowlist here because
 * there is no outbound request to allowlist.
 *
 * What remains is prompt injection: the text coming back is written by
 * strangers. Both tools are registered with `untrusted: true` so the loop
 * wraps their output before the model sees it.
 */
import { callMcpTool, truncateForModel } from './mcp-client';

const ENDPOINT = 'https://search.parallel.ai/mcp';

/** Search runs a retrieval pipeline upstream; measured 6-20s. */
const SEARCH_TIMEOUT_MS = 30_000;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Budget caps. The free provider tier gives 200,000 tokens per DAY for this
 * whole deployment (see lib/llm-budget.ts), and tool output is re-sent on
 * every remaining iteration. Parallel happily returns 10 results with long
 * excerpts; passing that straight through would spend a meaningful slice of
 * the day on one question.
 */
const MAX_RESULTS = 4;
const MAX_EXCERPT_CHARS = 320;
const MAX_TOTAL_CHARS = 1600;
const MAX_FETCH_CHARS = 1800;

/** Parallel accepts up to 20 URLs; one is all a mentoring answer needs. */
const MAX_URLS = 3;

export type WebResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; detail: string };

export function isWebSearchEnabled(): boolean {
  // Keyless, so there is nothing to configure. The flag exists so an operator
  // can turn the outbound dependency off without a code change.
  return process.env.WEB_SEARCH_DISABLED !== '1';
}

interface ParallelResult {
  url?: unknown;
  title?: unknown;
  publish_date?: unknown;
  excerpts?: unknown;
}

/** Strips control characters; everything here is third-party text. */
function clean(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/**
 * Renders Parallel's results into the compact form the model reads.
 *
 * Every entry keeps its URL, because an answer a student cannot verify is
 * worth very little — and because showing the real source is what lets them
 * notice when the agent has been misled.
 */
function renderResults(raw: unknown): string {
  if (!Array.isArray(raw)) return '';
  const lines: string[] = [];
  let used = 0;

  for (const item of raw.slice(0, MAX_RESULTS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as ParallelResult;
    const url = clean(r.url, 300);
    if (!url) continue;
    const title = clean(r.title, 120) || url;
    const date = clean(r.publish_date, 12);
    const excerpt = Array.isArray(r.excerpts)
      ? clean(r.excerpts.filter((e) => typeof e === 'string').join(' '), MAX_EXCERPT_CHARS)
      : '';

    const block = `- ${title}${date ? ` (${date})` : ''}\n  ${url}\n  ${excerpt}`;
    if (used + block.length > MAX_TOTAL_CHARS) break;
    lines.push(block);
    used += block.length;
  }
  return lines.join('\n');
}

/**
 * Searches the web.
 *
 * `sessionId` should be the student's Kairi chat id: Parallel uses it for
 * free-tier rate limiting and asks that it stay stable across a conversation,
 * which is exactly what a chat id already is. It is an opaque UUID and
 * carries no identity, so sending it discloses nothing about the student.
 */
export async function webSearch(
  objectiveRaw: unknown,
  queriesRaw: unknown,
  sessionId: string,
): Promise<WebResult> {
  if (!isWebSearchEnabled()) {
    return { ok: false, detail: 'Web search is turned off on this deployment.' };
  }

  const objective = typeof objectiveRaw === 'string' ? objectiveRaw.trim().slice(0, 400) : '';
  if (!objective) {
    return { ok: false, detail: 'Say what you are trying to find out.' };
  }

  const queries = (Array.isArray(queriesRaw) ? queriesRaw : [queriesRaw])
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 3);
  if (queries.length === 0) {
    return { ok: false, detail: 'Give at least one short search query.' };
  }

  const res = await callMcpTool(
    ENDPOINT,
    'web_search',
    { objective, search_queries: queries, session_id: sessionId },
    { timeoutMs: SEARCH_TIMEOUT_MS, label: 'parallel-search' },
  );
  if (!res.ok) return { ok: false, detail: res.detail };

  const rendered = renderResults(res.structured?.results);
  if (!rendered) {
    return { ok: false, detail: 'That search came back with nothing usable. Try different words.' };
  }
  const { text, truncated } = truncateForModel(rendered, MAX_TOTAL_CHARS);
  return { ok: true, text, truncated };
}

/** Accepts only http(s) URLs, so the model cannot ask for file:// or data:. */
function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  return u.toString();
}

/**
 * Reads specific web pages.
 *
 * Excerpt mode by default: Parallel's `full_content` returns whole articles,
 * routinely tens of thousands of tokens, which a 200,000-tokens-per-day
 * deployment cannot spend on one question. We never enable it.
 */
export async function readUrls(
  urlsRaw: unknown,
  objectiveRaw: unknown,
  sessionId: string,
): Promise<WebResult> {
  if (!isWebSearchEnabled()) {
    return { ok: false, detail: 'Web reading is turned off on this deployment.' };
  }

  const list = Array.isArray(urlsRaw) ? urlsRaw : [urlsRaw];
  const urls = list
    .map(normalizeUrl)
    .filter((u): u is string => Boolean(u))
    .slice(0, MAX_URLS);
  if (urls.length === 0) {
    return { ok: false, detail: 'Give me one or more http(s) links to read.' };
  }

  const objective = typeof objectiveRaw === 'string' ? objectiveRaw.trim().slice(0, 200) : '';

  const res = await callMcpTool(
    ENDPOINT,
    'web_fetch',
    {
      urls,
      ...(objective ? { objective } : {}),
      full_content: false,
      session_id: sessionId,
    },
    { timeoutMs: FETCH_TIMEOUT_MS, label: 'parallel-fetch' },
  );
  if (!res.ok) return { ok: false, detail: res.detail };

  const results = res.structured?.results;
  if (!Array.isArray(results) || results.length === 0) {
    return { ok: false, detail: 'Could not read that page. It may be private or unavailable.' };
  }

  const blocks: string[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const r = item as ParallelResult;
    const url = clean(r.url, 300);
    const title = clean(r.title, 120) || url;
    const body = Array.isArray(r.excerpts)
      ? clean(r.excerpts.filter((e) => typeof e === 'string').join('\n'), MAX_FETCH_CHARS)
      : '';
    if (!body) continue;
    blocks.push(`${title}\n${url}\n${body}`);
  }
  if (blocks.length === 0) {
    return { ok: false, detail: 'That page had no readable text.' };
  }

  const { text, truncated } = truncateForModel(blocks.join('\n\n'), MAX_FETCH_CHARS);
  return { ok: true, text, truncated };
}
