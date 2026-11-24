/**
 * lib/org-explorer-filter.ts
 *
 * Client-safe filtering, sorting and facets for the organisations explorer.
 * Cards come from the server (lib/org-explorer.ts); the GSoC dataset is
 * fetched by the page and joined here by `gsocSlug`. Everything is pure so
 * the page stays a thin layer over these.
 */
import type { GsocOrg, OrgCard, ProgramKey } from './org-explorer-types';

export type SortKey = 'recommended' | 'contributors' | 'years' | 'projects' | 'newest' | 'name';

export const SORTS: ReadonlyArray<{ key: SortKey; label: string; hint: string }> = [
  { key: 'recommended', label: 'Recommended', hint: 'Where NST already contributes first, then the longest-running organisations' },
  { key: 'contributors', label: 'Most NST contributors', hint: 'Organisations with the most of our students' },
  { key: 'years', label: 'Longest in GSoC', hint: 'Most years as a GSoC organisation: the steadiest bets' },
  { key: 'projects', label: 'Most GSoC projects', hint: 'Most students mentored over the years: the most slots' },
  { key: 'newest', label: 'New to GSoC', hint: 'First-time organisations first: fewer applicants compete there' },
  { key: 'name', label: 'A → Z', hint: 'Alphabetical' },
];

/** Technologies a beginner is likely to know: the quick picks above the facets. */
export const TECH_QUICK_PICKS: ReadonlyArray<string> = ['python', 'javascript', 'typescript', 'c++', 'c', 'java', 'go', 'rust', 'react', 'android', 'kotlin', 'machine learning'];

export interface ExplorerFilters {
  program: ProgramKey | 'all';
  onlyOurs: boolean;
  search: string;
  /** Any of these GSoC years. */
  years: number[];
  /** Any of these dataset categories. */
  categories: string[];
  /** Any of these technologies (lower-case). */
  techs: string[];
  /** Any of these topics (lower-case). */
  topics: string[];
  sort: SortKey;
}

export const DEFAULT_FILTERS: ExplorerFilters = { program: 'all', onlyOurs: false, search: '', years: [], categories: [], techs: [], topics: [], sort: 'recommended' };

export type GsocMap = ReadonlyMap<string, GsocOrg>;

export function metaOf(card: OrgCard, gsoc: GsocMap): GsocOrg | undefined {
  return card.gsocSlug ? gsoc.get(card.gsocSlug) : undefined;
}

export function yearsOf(card: OrgCard, gsoc: GsocMap): number[] {
  return metaOf(card, gsoc)?.years ?? card.years ?? [];
}

const anyOf = (wanted: ReadonlyArray<string>, have: ReadonlyArray<string> | undefined) =>
  wanted.length === 0 || (have !== undefined && wanted.some((w) => have.includes(w)));

/** Does the card pass the metadata filters (years, categories, technologies, topics) and the text search? */
export function matchesCard(card: OrgCard, gsoc: GsocMap, f: ExplorerFilters): boolean {
  if (f.program !== 'all' && !card.programs.includes(f.program)) return false;
  if (f.onlyOurs && card.contributors === 0) return false;
  const meta = metaOf(card, gsoc);
  if (f.years.length > 0) {
    const years = yearsOf(card, gsoc);
    if (!f.years.some((y) => years.includes(y))) return false;
  }
  if (f.categories.length > 0 && (!meta || !f.categories.includes(meta.category))) return false;
  if (!anyOf(f.techs, meta?.technologies)) return false;
  if (!anyOf(f.topics, meta?.topics)) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [card.login, card.name, card.description ?? '', meta?.category ?? '', ...(meta?.technologies ?? []), ...(meta?.topics ?? [])].join('\n').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function filterCards(cards: ReadonlyArray<OrgCard>, gsoc: GsocMap, f: ExplorerFilters): OrgCard[] {
  return cards.filter((c) => matchesCard(c, gsoc, f));
}

export function sortCards(cards: ReadonlyArray<OrgCard>, gsoc: GsocMap, sort: SortKey): OrgCard[] {
  const years = (c: OrgCard) => yearsOf(c, gsoc).length;
  const projects = (c: OrgCard) => metaOf(c, gsoc)?.projects ?? 0;
  const first = (c: OrgCard) => { const y = yearsOf(c, gsoc); return y.length ? Math.min(...y) : 0; };
  const byName = (a: OrgCard, b: OrgCard) => a.name.localeCompare(b.name);
  const cmp: Record<SortKey, (a: OrgCard, b: OrgCard) => number> = {
    recommended: (a, b) => b.contributors - a.contributors || b.mergedPRs - a.mergedPRs || years(b) - years(a) || projects(b) - projects(a) || byName(a, b),
    contributors: (a, b) => b.contributors - a.contributors || b.mergedPRs - a.mergedPRs || byName(a, b),
    years: (a, b) => years(b) - years(a) || projects(b) - projects(a) || byName(a, b),
    projects: (a, b) => projects(b) - projects(a) || years(b) - years(a) || byName(a, b),
    // Newest first; organisations without a known first year go last.
    newest: (a, b) => (first(b) || -1) - (first(a) || -1) || projects(b) - projects(a) || byName(a, b),
    name: byName,
  };
  return [...cards].sort(cmp[sort]);
}

export interface Facet { value: string; count: number }

export interface Facets {
  years: Array<{ value: number; count: number }>;
  categories: Facet[];
  techs: Facet[];
  topics: Facet[];
}

/** How many of the given cards each facet value would keep. Computed over the
 *  cards matching everything except the facets themselves, so counts stay
 *  honest as the search and programme change. */
export function facetsOf(cards: ReadonlyArray<OrgCard>, gsoc: GsocMap): Facets {
  const years = new Map<number, number>();
  const categories = new Map<string, number>();
  const techs = new Map<string, number>();
  const topics = new Map<string, number>();
  const bump = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const c of cards) {
    for (const y of yearsOf(c, gsoc)) bump(years, y);
    const meta = metaOf(c, gsoc);
    if (!meta) continue;
    bump(categories, meta.category);
    for (const t of new Set(meta.technologies)) bump(techs, t);
    for (const t of new Set(meta.topics)) bump(topics, t);
  }
  const list = (m: Map<string, number>) => [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    years: [...years].map(([value, count]) => ({ value, count })).sort((a, b) => b.value - a.value),
    categories: list(categories),
    techs: list(techs),
    topics: list(topics),
  };
}

/** "2016–21, 2025–26" from the years an organisation mentored in. */
export function yearRanges(years: ReadonlyArray<number>): string {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < ys.length; ) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++;
    parts.push(i === j ? String(ys[i]) : `${ys[i]}–${String(ys[j]).slice(2)}`);
    i = j + 1;
  }
  return parts.join(', ');
}

export function toggleIn<T>(list: ReadonlyArray<T>, value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function activeFacetCount(f: ExplorerFilters): number {
  return f.years.length + f.categories.length + f.techs.length + f.topics.length;
}

const SORT_KEYS = new Set<string>(SORTS.map((s) => s.key));

/** Filters from the page URL, so a selection can be shared or bookmarked. */
export function parseFilters(params: URLSearchParams, programKeys: ReadonlySet<string>): ExplorerFilters {
  const list = (k: string) => (params.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const program = params.get('program') ?? 'all';
  const sort = params.get('sort') ?? 'recommended';
  return {
    program: programKeys.has(program) ? (program as ProgramKey) : 'all',
    onlyOurs: params.get('ours') === '1',
    search: params.get('q') ?? '',
    years: list('year').map(Number).filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100),
    categories: list('category'),
    techs: list('tech').map((t) => t.toLowerCase()),
    topics: list('topic').map((t) => t.toLowerCase()),
    sort: SORT_KEYS.has(sort) ? (sort as SortKey) : 'recommended',
  };
}

export function filtersToParams(f: ExplorerFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.program !== 'all') p.set('program', f.program);
  if (f.onlyOurs) p.set('ours', '1');
  if (f.search.trim()) p.set('q', f.search.trim());
  if (f.years.length) p.set('year', [...f.years].sort((a, b) => b - a).join(','));
  if (f.categories.length) p.set('category', f.categories.join(','));
  if (f.techs.length) p.set('tech', f.techs.join(','));
  if (f.topics.length) p.set('topic', f.topics.join(','));
  if (f.sort !== 'recommended') p.set('sort', f.sort);
  return p;
}
