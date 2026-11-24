import { describe, it, expect } from 'vitest';
import type { GsocOrg, OrgCard } from './org-explorer-types';
import { DEFAULT_FILTERS, facetsOf, filterCards, filtersToParams, parseFilters, sortCards, yearRanges } from './org-explorer-filter';

const card = (login: string, extra: Partial<OrgCard> = {}): OrgCard => ({
  login, name: login, avatarUrl: '', url: `https://github.com/${login}`, contributors: 0, mergedPRs: 0, top: [], people: [], programs: ['gsoc'], tags: ['GSoC'], ...extra,
});
const meta = (slug: string, extra: Partial<GsocOrg> = {}): GsocOrg => ({
  slug, name: slug, github: slug, category: 'Web', description: '', url: null, image: null, years: [2024, 2025, 2026], technologies: ['python'], topics: ['web'], projects: 10, projectsByYear: {}, ...extra,
});

const gsoc = new Map<string, GsocOrg>([
  ['sympy', meta('sympy', { category: 'Science and medicine', years: [2016, 2017, 2018, 2019, 2020, 2021, 2025, 2026], technologies: ['python', 'c++'], topics: ['mathematics', 'symbolic'], projects: 60 })],
  ['newbie', meta('newbie', { years: [2026], technologies: ['typescript', 'react'], topics: ['web'], projects: 3 })],
  ['oldweb', meta('oldweb', { years: [2016, 2017], technologies: ['php'], topics: ['web'], projects: 8 })],
]);
const cards: OrgCard[] = [
  card('sympy', { gsocSlug: 'sympy', contributors: 2, mergedPRs: 5, people: ['a', 'b'] }),
  card('newbie', { gsocSlug: 'newbie' }),
  card('oldweb', { gsocSlug: 'oldweb' }),
  card('listed-only', { years: [2026] }), // on the programme list, no dataset record
  card('KDE', { programs: ['sok'], tags: ['Season of KDE'] }),
];

describe('org explorer filters', () => {
  it('filters by programme, years (any of), technologies, categories, topics and search', () => {
    const f = { ...DEFAULT_FILTERS };
    expect(filterCards(cards, gsoc, { ...f, program: 'gsoc' }).map((c) => c.login)).toEqual(['sympy', 'newbie', 'oldweb', 'listed-only']);
    // the year filter also works for listed organisations without a dataset record
    expect(filterCards(cards, gsoc, { ...f, years: [2026] }).map((c) => c.login)).toEqual(['sympy', 'newbie', 'listed-only']);
    expect(filterCards(cards, gsoc, { ...f, years: [2017, 2026] }).map((c) => c.login)).toEqual(['sympy', 'newbie', 'oldweb', 'listed-only']);
    expect(filterCards(cards, gsoc, { ...f, techs: ['python', 'react'] }).map((c) => c.login)).toEqual(['sympy', 'newbie']);
    expect(filterCards(cards, gsoc, { ...f, categories: ['Web'] }).map((c) => c.login)).toEqual(['newbie', 'oldweb']);
    expect(filterCards(cards, gsoc, { ...f, topics: ['mathematics'] }).map((c) => c.login)).toEqual(['sympy']);
    expect(filterCards(cards, gsoc, { ...f, search: 'symbolic' }).map((c) => c.login)).toEqual(['sympy']);
    expect(filterCards(cards, gsoc, { ...f, search: 'TypeScript' }).map((c) => c.login)).toEqual(['newbie']);
    expect(filterCards(cards, gsoc, { ...f, onlyOurs: true }).map((c) => c.login)).toEqual(['sympy']);
  });

  it('sorts by the chosen key', () => {
    const g = cards.slice(0, 3);
    expect(sortCards(g, gsoc, 'recommended').map((c) => c.login)).toEqual(['sympy', 'oldweb', 'newbie']);
    expect(sortCards(g, gsoc, 'years').map((c) => c.login)).toEqual(['sympy', 'oldweb', 'newbie']);
    expect(sortCards(g, gsoc, 'projects').map((c) => c.login)).toEqual(['sympy', 'oldweb', 'newbie']);
    expect(sortCards(g, gsoc, 'newest').map((c) => c.login)).toEqual(['newbie', 'sympy', 'oldweb']);
    expect(sortCards(g, gsoc, 'name').map((c) => c.login)).toEqual(['newbie', 'oldweb', 'sympy']);
  });

  it('counts facets over the given cards', () => {
    const fx = facetsOf(cards, gsoc);
    expect(fx.years[0]).toEqual({ value: 2026, count: 3 });
    expect(fx.techs.find((t) => t.value === 'python')).toEqual({ value: 'python', count: 1 });
    expect(fx.categories.map((c) => c.value)).toEqual(['Web', 'Science and medicine']);
    expect(fx.topics.find((t) => t.value === 'web')?.count).toBe(2);
  });

  it('formats year ranges', () => {
    expect(yearRanges([2016, 2017, 2018, 2019, 2020, 2021, 2025, 2026])).toBe('2016–21, 2025–26');
    expect(yearRanges([2026])).toBe('2026');
    expect(yearRanges([])).toBe('');
  });

  it('round-trips filters through URL params and ignores junk', () => {
    const keys = new Set(['gsoc', 'lfx']);
    const f = { ...DEFAULT_FILTERS, program: 'gsoc' as const, years: [2026, 2025], techs: ['python'], search: 'math', sort: 'newest' as const, onlyOurs: true };
    const back = parseFilters(filtersToParams(f), keys);
    expect(back).toEqual(f);
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
    expect(parseFilters(new URLSearchParams('program=nope&sort=bogus&year=abc,2024'), keys)).toEqual({ ...DEFAULT_FILTERS, years: [2024] });
  });
});
