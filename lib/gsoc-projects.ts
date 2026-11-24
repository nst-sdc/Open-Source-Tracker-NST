/**
 * lib/gsoc-projects.ts
 *
 * An organisation's GSoC projects for one year, from the official GSoC site.
 * From 2022 the site has a JSON API per programme year
 * (/api/archive/programs/{year}/organizations/{slug}/ lists the organisation
 * with its projects); answers are kept in KV for a week. For 2016–2021 the
 * site has pages but no API, so those years come from
 * data/gsoc-projects-archive.json, titles with their official archive links.
 */
import gsocArchive from '@/data/gsoc-projects-archive.json';
import { kvGet, kvSet } from './kv';
import { GSOC_FIRST_YEAR, GSOC_LAST_YEAR, type GsocProject } from './org-explorer-types';

export const OFFICIAL_API_FIRST_YEAR = 2022;
const CACHE_TTL_S = 7 * 24 * 60 * 60;

type ArchiveFile = Record<string, Record<string, Array<{ t: string; u: string; s?: string; c?: string }>>>;
const ARCHIVE = gsocArchive as ArchiveFile;

interface OfficialOrg {
  slug: string;
  ideas_list_url?: string | null;
  projects?: Array<{
    id: string;
    title: string;
    project_code_url?: string | null;
    contributor_display_name?: string | null;
    mentor_names?: string[];
    abstract_short?: string | null;
    tech_tags?: string[];
    status?: string;
  }>;
}

export function officialOrgApiUrl(slug: string, year: number): string {
  return `https://summerofcode.withgoogle.com/api/archive/programs/${year}/organizations/${encodeURIComponent(slug)}/`;
}

export function officialProjectUrl(year: number, id: string): string {
  const base = year >= GSOC_LAST_YEAR ? `programs/${year}` : `archive/${year}`;
  return `https://summerofcode.withgoogle.com/${base}/projects/${encodeURIComponent(id)}`;
}

/** The official answer, trimmed to what the sheet shows. */
export function normalizeOfficial(org: OfficialOrg, year: number): GsocProject[] {
  return (org.projects ?? []).map((p) => {
    const out: GsocProject = { title: p.title, url: officialProjectUrl(year, p.id) };
    if (p.contributor_display_name) out.contributor = p.contributor_display_name;
    if (p.mentor_names?.length) out.mentors = p.mentor_names;
    if (p.abstract_short) out.summary = p.abstract_short;
    if (p.project_code_url) out.codeUrl = p.project_code_url;
    if (p.tech_tags?.length) out.tech = p.tech_tags;
    return out;
  });
}

/** 2016–2021 from the archive file. */
export function archivedProjects(slug: string, year: number): GsocProject[] | null {
  const list = ARCHIVE[slug]?.[String(year)];
  if (!list) return null;
  return list.map((p) => {
    const out: GsocProject = { title: p.t, url: p.u };
    if (p.s) out.contributor = p.s;
    if (p.c) out.codeUrl = p.c;
    return out;
  });
}

export interface GsocYear {
  projects: GsocProject[];
  /** The organisation's ideas list for that year, when the official site has it. */
  ideasListUrl?: string;
}

export type GsocProjectsResult =
  | ({ ok: true; year: number; source: 'official' | 'archive' } & GsocYear)
  | { ok: false; year: number; reason: 'bad-year' | 'not-found' | 'unavailable' };

export async function getGsocProjects(slug: string, year: number, deps: { fetch?: typeof fetch; cache?: boolean } = {}): Promise<GsocProjectsResult> {
  if (!Number.isInteger(year) || year < GSOC_FIRST_YEAR || year > GSOC_LAST_YEAR || !/^[a-z0-9-]+$/i.test(slug)) return { ok: false, year, reason: 'bad-year' };
  if (year < OFFICIAL_API_FIRST_YEAR) {
    const projects = archivedProjects(slug, year);
    return projects ? { ok: true, year, source: 'archive', projects } : { ok: false, year, reason: 'not-found' };
  }
  const key = `gsoc_projects:v2:${year}:${slug.toLowerCase()}`;
  const useCache = deps.cache !== false;
  const cached = useCache ? await kvGet<GsocYear>(key) : null;
  if (cached) return { ok: true, year, source: 'official', ...cached };
  const f = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(officialOrgApiUrl(slug, year), { headers: { Accept: 'application/json', 'User-Agent': 'opensource-tracker-nst' }, cache: 'no-store' });
  } catch {
    return { ok: false, year, reason: 'unavailable' };
  }
  if (res.status === 404) return { ok: false, year, reason: 'not-found' };
  if (!res.ok) return { ok: false, year, reason: 'unavailable' };
  let body: OfficialOrg;
  try {
    body = (await res.json()) as OfficialOrg;
  } catch {
    return { ok: false, year, reason: 'unavailable' };
  }
  const value: GsocYear = { projects: normalizeOfficial(body, year) };
  if (body.ideas_list_url && /^https?:\/\//.test(body.ideas_list_url)) value.ideasListUrl = body.ideas_list_url;
  if (useCache) await kvSet(key, value, CACHE_TTL_S);
  return { ok: true, year, source: 'official', ...value };
}
