/**
 * lib/org-explorer-filter.ts
 *
 * Client-safe filtering, sorting and facets for the organisations explorer.
 * Cards come from the server (lib/org-explorer.ts); the GSoC dataset is
 * fetched by the page and joined here by `gsocSlug`. Everything is pure so
 * the page stays a thin layer over these.
 */
import type { GsocOrg, OrgCard, ProgramKey } from './org-explorer-types';
import { combinedShare, type OrgLanguageMap } from './org-languages-shared';

export type SortKey = 'recommended' | 'language' | 'contributors' | 'recent' | 'oldest' | 'years' | 'slots' | 'newest' | 'name' | 'name-desc';

export interface SortOption { key: SortKey; label: string; hint: string }

/** Programmes the explorer has a year-by-year history for. */
export const HISTORY_PROGRAMS: ReadonlySet<ProgramKey> = new Set<ProgramKey>(['gsoc', 'lfx']);

const COMMON_SORTS: ReadonlyArray<SortOption> = [
  { key: 'recommended', label: 'Recommended', hint: 'Where NST already contributes first, then the longest-running organisations' },
  { key: 'language', label: 'Language share', hint: 'Most of the chosen languages in the code first (GitHub bytes across the most-starred repositories)' },
  { key: 'contributors', label: 'Most NST contributors', hint: 'Organisations with the most of our students' },
];
const NAME_SORTS: ReadonlyArray<SortOption> = [
  { key: 'name', label: 'A → Z', hint: 'Alphabetical' },
  { key: 'name-desc', label: 'Z → A', hint: 'Reverse alphabetical' },
];

/** The sort options that make sense for the selected programme: the history
 *  orders (slots, years, recent, oldest, new) only where there is a history,
 *  worded for that programme; nothing GSoC- or LFX-specific under "All". */
export function sortsFor(program: ProgramKey | 'all'): SortOption[] {
  if (!HISTORY_PROGRAMS.has(program as ProgramKey)) return [...COMMON_SORTS, ...NAME_SORTS];
  const P = program === 'gsoc' ? 'GSoC' : 'LFX';
  const slot = program === 'gsoc' ? 'projects' : 'mentorships';
  return [
    ...COMMON_SORTS,
    { key: 'slots', label: `Most ${P} slots`, hint: `Most ${P} ${slot} over the years: the most places` },
    { key: 'years', label: `Most years in ${P}`, hint: `Most years as a ${P} organisation: the steadiest bets` },
    { key: 'recent', label: `Recently in ${P}`, hint: `Most recent ${P} year first` },
    { key: 'oldest', label: `Oldest in ${P}`, hint: `Earliest first ${P} year first: the veterans` },
    { key: 'newest', label: `New to ${P}`, hint: 'First-time organisations first: fewer applicants compete there' },
    ...NAME_SORTS,
  ];
}

/** Every sort key, for parsing URLs. */
export const SORTS: ReadonlyArray<SortOption> = sortsFor('gsoc');

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
  /** Languages as GitHub names them; an organisation must have every one of
   *  them in its code (above the noise floor). */
  langs: string[];
  sort: SortKey;
}

export const DEFAULT_FILTERS: ExplorerFilters = { program: 'all', onlyOurs: false, search: '', years: [], categories: [], techs: [], topics: [], langs: [], sort: 'recommended' };

export type GsocMap = ReadonlyMap<string, GsocOrg>;
export type LangMap = Readonly<OrgLanguageMap>;
export const NO_LANGS: LangMap = {};

export function langsOf(card: OrgCard, langs: LangMap) {
  // An umbrella's own repositories (a website, some templates) say nothing
  // about the code its member projects write, so it has no language profile.
  return card.site || card.umbrella ? undefined : langs[card.login.toLowerCase()];
}

/** The sort that applies: a language pick sorts by share unless another order
 *  was chosen, and an order the programme has no data for falls back to
 *  recommended (a GSoC history order carried over to the CNCF chip). */
export function effectiveSort(f: ExplorerFilters): SortKey {
  const available = sortsFor(f.program).some((s) => s.key === f.sort) && (f.sort !== 'language' || f.langs.length > 0);
  const sort = available ? f.sort : 'recommended';
  return f.langs.length > 0 && sort === 'recommended' ? 'language' : sort;
}

export function metaOf(card: OrgCard, gsoc: GsocMap): GsocOrg | undefined {
  return card.gsocSlug ? gsoc.get(card.gsocSlug) : undefined;
}

/** Programme years that count for the current view: GSoC's under the GSoC
 *  chip, LFX's under the LFX chip, every programme's otherwise. */
export function yearsOf(card: OrgCard, gsoc: GsocMap, program: ProgramKey | 'all' = 'all'): number[] {
  const g = metaOf(card, gsoc)?.years ?? card.years ?? [];
  const l = card.lfx?.years ?? [];
  if (program === 'lfx') return l;
  if (program === 'gsoc') return g;
  return [...new Set([...g, ...l])].sort((a, b) => a - b);
}

/** Projects (slots) run in the programmes that count for the current view. */
export function projectsOf(card: OrgCard, gsoc: GsocMap, program: ProgramKey | 'all' = 'all'): number {
  const g = metaOf(card, gsoc)?.projects ?? 0;
  const l = card.lfx?.projects ?? 0;
  if (program === 'lfx') return l;
  if (program === 'gsoc') return g;
  return g + l;
}

/** What the organisation says it builds with: the GSoC dataset's technologies,
 *  or the skills its LFX projects asked for. */
export function techsOf(card: OrgCard, gsoc: GsocMap): string[] | undefined {
  return metaOf(card, gsoc)?.technologies ?? card.lfx?.skills;
}

const anyOf = (wanted: ReadonlyArray<string>, have: ReadonlyArray<string> | undefined) =>
  wanted.length === 0 || (have !== undefined && wanted.some((w) => have.includes(w)));

/** Does the card pass the metadata filters (years, categories, technologies, topics, languages) and the text search? */
export function matchesCard(card: OrgCard, gsoc: GsocMap, f: ExplorerFilters, langs: LangMap = NO_LANGS): boolean {
  if (f.program !== 'all' && !card.programs.includes(f.program)) return false;
  if (f.onlyOurs && card.contributors === 0) return false;
  if (f.langs.length > 0) {
    const profile = langsOf(card, langs);
    if (!profile || f.langs.some((l) => combinedShare(profile, [l]) === 0)) return false;
  }
  const meta = metaOf(card, gsoc);
  if (f.years.length > 0) {
    const years = yearsOf(card, gsoc, f.program);
    if (!f.years.some((y) => years.includes(y))) return false;
  }
  if (f.categories.length > 0 && (!meta || !f.categories.includes(meta.category))) return false;
  if (!anyOf(f.techs, techsOf(card, gsoc))) return false;
  if (!anyOf(f.topics, meta?.topics)) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [card.login, card.name, card.description ?? '', meta?.category ?? '', ...(techsOf(card, gsoc) ?? []), ...(meta?.topics ?? []), ...(card.lfx?.orgs ?? [])].join('\n').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function filterCards(cards: ReadonlyArray<OrgCard>, gsoc: GsocMap, f: ExplorerFilters, langs: LangMap = NO_LANGS): OrgCard[] {
  return cards.filter((c) => matchesCard(c, gsoc, f, langs));
}

export function sortCards(cards: ReadonlyArray<OrgCard>, gsoc: GsocMap, sort: SortKey, langs: LangMap = NO_LANGS, picked: ReadonlyArray<string> = [], program: ProgramKey | 'all' = 'all'): OrgCard[] {
  const years = (c: OrgCard) => yearsOf(c, gsoc, program).length;
  const projects = (c: OrgCard) => projectsOf(c, gsoc, program);
  const first = (c: OrgCard) => { const y = yearsOf(c, gsoc, program); return y.length ? Math.min(...y) : 0; };
  const last = (c: OrgCard) => { const y = yearsOf(c, gsoc, program); return y.length ? Math.max(...y) : 0; };
  const share = (c: OrgCard) => combinedShare(langsOf(c, langs), picked);
  const byName = (a: OrgCard, b: OrgCard) => a.name.localeCompare(b.name);
  const recommended = (a: OrgCard, b: OrgCard) => b.contributors - a.contributors || b.mergedPRs - a.mergedPRs || years(b) - years(a) || projects(b) - projects(a) || byName(a, b);
  const cmp: Record<SortKey, (a: OrgCard, b: OrgCard) => number> = {
    recommended,
    language: (a, b) => share(b) - share(a) || recommended(a, b),
    contributors: (a, b) => b.contributors - a.contributors || b.mergedPRs - a.mergedPRs || byName(a, b),
    recent: (a, b) => last(b) - last(a) || years(b) - years(a) || byName(a, b),
    // Earliest first year first; organisations without a known year go last.
    oldest: (a, b) => (first(a) || 9999) - (first(b) || 9999) || years(b) - years(a) || byName(a, b),
    years: (a, b) => years(b) - years(a) || projects(b) - projects(a) || byName(a, b),
    slots: (a, b) => projects(b) - projects(a) || years(b) - years(a) || byName(a, b),
    // Newest first; organisations without a known first year go last.
    newest: (a, b) => (first(b) || -1) - (first(a) || -1) || projects(b) - projects(a) || byName(a, b),
    name: byName,
    'name-desc': (a, b) => byName(b, a),
  };
  return [...cards].sort(cmp[sort]);
}

export interface Facet { value: string; count: number }

export interface Facets {
  years: Array<{ value: number; count: number }>;
  categories: Facet[];
  techs: Facet[];
  topics: Facet[];
  /** Languages GitHub measured, with how many organisations use each above the noise floor. */
  langs: Facet[];
}

/** How many of the given cards each facet value would keep. Computed over the
 *  cards matching everything except the facets themselves, so counts stay
 *  honest as the search and programme change. */
export function facetsOf(cards: ReadonlyArray<OrgCard>, gsoc: GsocMap, langs: LangMap = NO_LANGS, program: ProgramKey | 'all' = 'all'): Facets {
  const years = new Map<number, number>();
  const categories = new Map<string, number>();
  const techs = new Map<string, number>();
  const topics = new Map<string, number>();
  const languages = new Map<string, number>();
  const bump = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const c of cards) {
    for (const y of yearsOf(c, gsoc, program)) bump(years, y);
    const profile = langsOf(c, langs);
    if (profile) for (const [name] of profile.languages) if (combinedShare(profile, [name]) > 0) bump(languages, name);
    for (const t of new Set(techsOf(c, gsoc) ?? [])) bump(techs, t);
    const meta = metaOf(c, gsoc);
    if (!meta) continue;
    bump(categories, meta.category);
    for (const t of new Set(meta.topics)) bump(topics, t);
  }
  const list = (m: Map<string, number>) => [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    years: [...years].map(([value, count]) => ({ value, count })).sort((a, b) => b.value - a.value),
    categories: list(categories),
    techs: list(techs),
    topics: list(topics),
    langs: list(languages),
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
  return f.years.length + f.categories.length + f.techs.length + f.topics.length + f.langs.length;
}

export const EMPTY_FACETS: Pick<ExplorerFilters, 'years' | 'categories' | 'techs' | 'topics' | 'langs'> = { years: [], categories: [], techs: [], topics: [], langs: [] };

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
    langs: list('lang'),
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
  if (f.langs.length) p.set('lang', f.langs.join(','));
  if (f.sort !== 'recommended') p.set('sort', f.sort);
  return p;
}
