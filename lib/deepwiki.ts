/**
 * lib/deepwiki.ts — repository comprehension via DeepWiki.
 *
 * The point of this module: a student drops a repo link and asks "where do I
 * even start?". Reading that repo ourselves would cost more tokens than this
 * deployment has in a day (see lib/llm-budget.ts). DeepWiki has already
 * indexed most public GitHub repositories, so we ask it instead.
 *
 * Verified against the hosted endpoint on 2026-09-06: `read_wiki_structure`
 * returned a wiki for all 15 probed repos, from facebook/react down to
 * firstcontributions/first-contributions and rust-lang/mdBook. Coverage for
 * the repos a student would realistically contribute to is effectively total.
 *
 * NOT-INDEXED IS A REFUSAL, BY DECISION. A repository DeepWiki has never seen
 * (a small org repo, a brand-new project) is reported by the service as
 * *successful* tool content with HTTP 200 — not as an error — so it must be
 * detected in-band. When that happens we tell the student plainly that we
 * cannot help with that repository, rather than quietly falling back to a
 * weaker GitHub-only answer that reads like a real one. Serving a
 * confident-sounding degraded answer is worse than saying no. A self-hosted
 * indexer would close this gap and is deliberately deferred.
 *
 * The hosted service needs no API key and no account.
 *
 * TRUST: everything returned here is a third party's summary of a repository
 * anyone can edit — untrusted input in the OWASP LLM01 sense. The tools that
 * expose it are registered with `untrusted: true` so the loop wraps it before
 * the model sees it. This module never sends the caller's token or identity.
 */
import { callMcpTool, truncateForModel } from './mcp-client';

const ENDPOINT = 'https://mcp.deepwiki.com/mcp';

/**
 * `ask_question` runs a retrieval pipeline plus a model upstream; measured
 * 12-20s. The agent's own run deadline is 70s (lib/agent-loop.ts) and the
 * tunnel in front of the cluster cuts at ~100s, so one tool call may not eat
 * the whole budget.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Output caps. lib/agent-loop.ts re-sends the whole wire array on every
 * iteration, so R characters of tool output are billed R times over the
 * remaining iterations. An uncapped wiki page (~20 KB is normal) would spend
 * most of a minute's token allowance in a single call.
 */
const MAX_ANSWER_CHARS = 1800;
const MAX_STRUCTURE_CHARS = 900;

/**
 * Per-answer cap when the agent asks several narrow questions in one turn
 * instead of one broad one (see the issue-workflow rule in
 * lib/agent-loop.ts). Three answers at this size cost about what one
 * uncapped answer costs, so the fan-out buys the model more angles on the
 * problem rather than more tokens.
 */
export const FOCUSED_ANSWER_CHARS = 900;

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

export type DeepWikiFailure = 'not_indexed' | 'bad_repo' | 'unavailable';

export type DeepWikiResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: DeepWikiFailure; detail: string };

/**
 * Accepts what a student would actually paste — a full URL, a trailing .git,
 * extra path segments — and normalizes to `owner/repo`.
 *
 * Anything that reaches the network must come out of this function. The repo
 * name is model-composed text interpolated into a request body; REPO_RE is
 * the control that keeps it from being anything else.
 */
export function normalizeRepoName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s || s.length > 300) return null;

  // A github.com URL may carry more path than we want — /tree/main,
  // /issues/5 — so for URLs we keep the first two segments. A bare string
  // gets no such latitude: "a/b/c/d" is not a repository, and silently
  // reading it as "a/b" would have us answer about the wrong project.
  const isUrl = /^https?:\/\//i.test(s);
  if (isUrl) {
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      return null;
    }
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
    s = u.pathname;
  }
  s = s.replace(/^\/+/, '').replace(/\.git$/i, '');
  const segments = s.split('/').filter(Boolean);
  const parts = isUrl ? segments.slice(0, 2) : segments;
  if (parts.length !== 2) return null;
  // REPO_RE allows dots, so "." and ".." satisfy it — and callers interpolate
  // the result straight into an api.github.com path, where URL normalization
  // then resolves those segments and silently rewrites which endpoint is
  // called ("../.." turns /repos/../../issues/1 into /issues/1). GitHub has
  // no owner or repository named with dots alone, so rejecting them costs
  // nothing and keeps the path shape the caller wrote.
  if (parts.some((part) => /^\.+$/.test(part))) return null;
  const name = parts.join('/');
  return REPO_RE.test(name) ? name : null;
}

/**
 * A reference to one issue or pull request.
 *
 * `normalizeRepoName` deliberately throws the rest of a URL away, which is
 * right for "what is this repo" questions and wrong for "help me with this
 * issue": the number is the only part that identifies the actual task. This
 * parser keeps it.
 *
 * GitHub numbers issues and pull requests from the same sequence, and
 * `/repos/{owner}/{repo}/issues/{n}` serves both, so a `/pull/` link is
 * accepted here and resolved through the same endpoint.
 */
export interface IssueRef {
  repo: string;
  number: number;
}

/** Above this an issue number is a typo or a probe, not a real reference. */
const MAX_ISSUE_NUMBER = 10_000_000;

const ISSUE_URL_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})\/(?:issues|pull)\/(\d{1,8})(?:[/?#].*)?$/i;
const ISSUE_HASH_RE = /^([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})#(\d{1,8})$/;

/**
 * Accepts the forms a student actually pastes — a full issue or pull URL, or
 * the `owner/repo#123` shorthand — and yields a validated repo plus number.
 *
 * Both parts are interpolated into an api.github.com path, so this function
 * is the control that keeps them from being anything but a repo name and a
 * number.
 */
export function parseIssueRef(raw: unknown): IssueRef | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 300) return null;

  const url = s.match(ISSUE_URL_RE);
  if (url) {
    const repo = normalizeRepoName(`${url[1]}/${url[2]}`);
    const number = Number(url[3]);
    if (!repo || !Number.isInteger(number) || number < 1 || number > MAX_ISSUE_NUMBER) return null;
    return { repo, number };
  }

  const hash = s.match(ISSUE_HASH_RE);
  if (hash) {
    const repo = normalizeRepoName(hash[1]);
    const number = Number(hash[2]);
    if (!repo || !Number.isInteger(number) || number < 1 || number > MAX_ISSUE_NUMBER) return null;
    return { repo, number };
  }

  return null;
}

export function isDeepWikiEnabled(): boolean {
  // Keyless, so there is nothing to configure. The flag exists so an operator
  // can turn the outbound dependency off without a code change.
  return process.env.DEEPWIKI_DISABLED !== '1';
}

/**
 * The service reports an unknown repository as tool *content* with a 200
 * status, so this string match is the only way to distinguish "here is your
 * answer" from "I have never seen this repository".
 */
function isNotIndexed(text: string): boolean {
  return /Repository not found/i.test(text) || /deepwiki\.com to index/i.test(text);
}

async function ask(
  tool: string,
  args: Record<string, unknown>,
  limit: number,
): Promise<DeepWikiResult> {
  const res = await callMcpTool(ENDPOINT, tool, args, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    label: 'deepwiki',
  });
  if (!res.ok) return { ok: false, reason: 'unavailable', detail: res.detail };

  const raw = res.text || (typeof res.structured?.result === 'string' ? res.structured.result : '');
  if (!raw) {
    return { ok: false, reason: 'unavailable', detail: 'DeepWiki sent an empty response.' };
  }
  if (isNotIndexed(raw)) {
    return {
      ok: false,
      reason: 'not_indexed',
      detail: 'DeepWiki has not indexed that repository, so I cannot answer questions about its code.',
    };
  }
  const { text, truncated } = truncateForModel(raw, limit);
  return { ok: true, text, truncated };
}

/**
 * Asks DeepWiki a grounded question about a repository.
 *
 * `maxChars` exists so a turn that asks three narrow questions at once does
 * not cost three times a single broad one: the loop re-sends every tool
 * result on every remaining iteration, so the cap is a budget lever, not a
 * formatting preference.
 */
export async function askRepo(
  repoRaw: unknown,
  questionRaw: unknown,
  maxChars: number = MAX_ANSWER_CHARS,
): Promise<DeepWikiResult> {
  if (!isDeepWikiEnabled()) {
    return { ok: false, reason: 'unavailable', detail: 'Repository lookup is turned off on this deployment.' };
  }
  const repo = normalizeRepoName(repoRaw);
  if (!repo) {
    return { ok: false, reason: 'bad_repo', detail: 'Give me a repository as owner/repo or a github.com link.' };
  }
  const question = typeof questionRaw === 'string' ? questionRaw.trim().slice(0, 500) : '';
  if (!question) {
    return { ok: false, reason: 'bad_repo', detail: 'Ask a specific question about the repository.' };
  }
  const limit =
    Number.isFinite(maxChars) ? Math.min(Math.max(Math.floor(maxChars), 200), MAX_ANSWER_CHARS) : MAX_ANSWER_CHARS;
  return ask('ask_question', { repoName: repo, question }, limit);
}

/**
 * Lists the topics DeepWiki has documented for a repository — effectively a
 * table of contents. Cheaper than askRepo (no model runs upstream) and a good
 * first move when a student has named a repo but has no specific question.
 */
export async function repoTopics(repoRaw: unknown): Promise<DeepWikiResult> {
  if (!isDeepWikiEnabled()) {
    return { ok: false, reason: 'unavailable', detail: 'Repository lookup is turned off on this deployment.' };
  }
  const repo = normalizeRepoName(repoRaw);
  if (!repo) {
    return { ok: false, reason: 'bad_repo', detail: 'Give me a repository as owner/repo or a github.com link.' };
  }
  return ask('read_wiki_structure', { repoName: repo }, MAX_STRUCTURE_CHARS);
}
