/**
 * lib/org-languages.ts
 *
 * What each organisation's repositories are written in, according to
 * GitHub: one GraphQL call per organisation reads the languages (in bytes)
 * of its 50 most-starred public, non-fork repositories, and the shares go
 * into org_languages_map. The refresh tick measures a few organisations per
 * tick (the ones our students contribute to first, then every programme
 * organisation) and re-measures each one monthly; the admin endpoint drives
 * the first fill. The explorer's language filter and sort read this, so a
 * "Python" pick means Python in the code, not on a website.
 */
import { kvRead, kvSet } from './kv';
import { getGitHubHeaders } from './github';
import { readOrgIndex } from './org-index';
import { getOrgCache } from './org-cache';
import { programMembership, UMBRELLA_LOGINS } from './org-explorer';
import { aggregateLanguageBytes, type OrgLanguageMap, type OrgLanguageProfile } from './org-languages-shared';

export type { OrgLanguageMap, OrgLanguageProfile } from './org-languages-shared';

const KV_KEY = 'org_languages_map';
export const SAMPLE_REPOS = 50;
export const LANGUAGES_PER_REPO = 10;
export const REMEASURE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface OrgLanguageRecord extends OrgLanguageProfile {
  login: string;
  measuredAt: string;
  /** GitHub knows no organisation by this login (a user, renamed, gone). */
  missing?: boolean;
}

export type OrgLanguageStore = Record<string, OrgLanguageRecord>;

export async function readOrgLanguagesForWrite(): Promise<{ ok: boolean; store: OrgLanguageStore }> {
  const { ok, value } = await kvRead<OrgLanguageStore>(KV_KEY);
  return { ok, store: value || {} };
}

export async function readOrgLanguages(): Promise<OrgLanguageStore> {
  return (await readOrgLanguagesForWrite()).store;
}

export async function writeOrgLanguages(store: OrgLanguageStore): Promise<void> {
  await kvSet(KV_KEY, store);
}

/** The page's view: profiles by lower-case login, without the bookkeeping. */
export function toLanguageMap(store: OrgLanguageStore): OrgLanguageMap {
  const out: OrgLanguageMap = {};
  for (const [key, r] of Object.entries(store)) {
    if (r.missing || r.languages.length === 0) continue;
    out[key] = { repos: r.repos, totalRepos: r.totalRepos, languages: r.languages };
  }
  return out;
}

/** Organisations due for a measurement: never measured, or older than
 *  REMEASURE_AFTER_MS. Those with our contributors first (most first), then
 *  programme organisations alphabetically. Owners GitHub classified as users
 *  are left out; unknown owners are tried once and remembered as missing. */
export function dueOrgLanguages(input: {
  candidates: ReadonlyArray<{ login: string; contributors: number }>;
  store: OrgLanguageStore;
  nowMs: number;
}): string[] {
  const seen = new Set<string>();
  return [...input.candidates]
    .filter((c) => {
      const lower = c.login.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      const r = input.store[lower];
      return !r || input.nowMs - new Date(r.measuredAt).getTime() > REMEASURE_AFTER_MS;
    })
    .sort((a, b) => b.contributors - a.contributors || a.login.localeCompare(b.login))
    .map((c) => c.login);
}

/** Every organisation the explorer can show: index owners not known to be
 *  users, plus every programme organisation. */
export async function languageCandidates(): Promise<Array<{ login: string; contributors: number }>> {
  const [index, orgCache] = await Promise.all([readOrgIndex(), getOrgCache()]);
  const out = new Map<string, { login: string; contributors: number }>();
  for (const [key, e] of Object.entries(index)) {
    const login = e.login || key;
    const meta = orgCache[login.toLowerCase()];
    if (meta && !meta.isOrganization) continue;
    out.set(login.toLowerCase(), { login, contributors: Object.values(e.contributors).filter((n) => n > 0).length });
  }
  for (const [lower, m] of programMembership()) if (!out.has(lower)) out.set(lower, { login: m.login, contributors: 0 });
  for (const lower of UMBRELLA_LOGINS) out.delete(lower);
  return [...out.values()];
}

interface GqlRepoNode { name: string; languages: { totalSize: number; edges: Array<{ size: number; node: { name: string } }> } | null }
interface GqlBody {
  data?: { organization: { repositories: { totalCount: number; nodes: GqlRepoNode[] } } | null } | null;
  errors?: Array<{ type?: string; message: string }>;
}

export const ORG_LANGUAGES_QUERY = `query OrgLanguages($login: String!, $repos: Int!, $langs: Int!) {
  organization(login: $login) {
    repositories(first: $repos, privacy: PUBLIC, isFork: false, isArchived: false, orderBy: { field: STARGAZERS, direction: DESC }) {
      totalCount
      nodes { name languages(first: $langs, orderBy: { field: SIZE, direction: DESC }) { totalSize edges { size node { name } } } }
    }
  }
}`;

export type MeasureOutcome = { kind: 'ok'; record: OrgLanguageRecord } | { kind: 'missing' } | { kind: 'rate-limited' } | { kind: 'error'; message: string };

/** One organisation, one GraphQL call. */
export async function measureOrgLanguages(login: string, headers: HeadersInit, deps: { fetch?: typeof fetch; now?: () => Date } = {}): Promise<MeasureOutcome> {
  const f = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  let body: GqlBody;
  try {
    const res = await f('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ORG_LANGUAGES_QUERY, variables: { login, repos: SAMPLE_REPOS, langs: LANGUAGES_PER_REPO } }),
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403 || res.status === 429) return { kind: 'rate-limited' };
    if (!res.ok) return { kind: 'error', message: `GraphQL answered ${res.status}` };
    body = (await res.json()) as GqlBody;
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
  const org = body.data?.organization;
  if (!org) {
    if (body.errors?.some((e) => e.type === 'NOT_FOUND' || /Could not resolve/i.test(e.message))) return { kind: 'missing' };
    if (body.errors?.some((e) => e.type === 'RATE_LIMITED')) return { kind: 'rate-limited' };
    return { kind: 'error', message: body.errors?.[0]?.message ?? 'empty answer' };
  }
  const repos = org.repositories.nodes.filter(Boolean).map((n) => ({
    languages: (n.languages?.edges ?? []).map((e) => ({ name: e.node.name, size: e.size })),
  }));
  const profile = aggregateLanguageBytes(repos, org.repositories.totalCount);
  return { kind: 'ok', record: { login, measuredAt: now().toISOString(), ...profile } };
}

/**
 * Measures up to `limit` due organisations and saves the store. Stops at a
 * rate limit or when `budgetMs` has passed, reporting what it got through.
 */
export async function refreshOrgLanguages(
  limit: number,
  deps: { fetch?: typeof fetch; now?: () => Date; budgetMs?: number; headers?: HeadersInit } = {},
): Promise<{ measured: number; missing: number; remaining: number; stoppedBy?: string }> {
  const now = deps.now ?? (() => new Date());
  const started = now().getTime();
  const [candidates, { ok, store }] = await Promise.all([languageCandidates(), readOrgLanguagesForWrite()]);
  if (!ok) return { measured: 0, missing: 0, remaining: -1, stoppedBy: 'language store unreadable' };
  const due = dueOrgLanguages({ candidates, store, nowMs: started });
  const headers = deps.headers ?? (await getGitHubHeaders());
  let measured = 0;
  let missing = 0;
  let stoppedBy: string | undefined;
  for (const login of due.slice(0, Math.max(0, limit))) {
    if (deps.budgetMs && now().getTime() - started > deps.budgetMs) { stoppedBy = 'time budget'; break; }
    const out = await measureOrgLanguages(login, headers, deps);
    if (out.kind === 'rate-limited') { stoppedBy = 'GitHub rate limit'; break; }
    if (out.kind === 'error') { console.warn(`[org-languages] ${login}: ${out.message}`); continue; }
    if (out.kind === 'missing') {
      store[login.toLowerCase()] = { login, measuredAt: now().toISOString(), missing: true, repos: 0, totalRepos: 0, languages: [] };
      missing++;
      continue;
    }
    store[login.toLowerCase()] = out.record;
    measured++;
  }
  if (measured + missing > 0) {
    // A sheet may have measured an organisation on demand while this pass ran;
    // merge the store as it is now so that answer is not overwritten.
    const latest = await readOrgLanguagesForWrite();
    const merged: OrgLanguageStore = latest.ok ? { ...latest.store } : {};
    for (const [k, r] of Object.entries(store)) {
      const other = merged[k];
      if (!other || new Date(r.measuredAt).getTime() >= new Date(other.measuredAt).getTime()) merged[k] = r;
    }
    await writeOrgLanguages(merged);
  }
  return { measured, missing, remaining: Math.max(0, due.length - measured - missing), ...(stoppedBy ? { stoppedBy } : {}) };
}
