import { describe, it, expect } from 'vitest';
import type { GsocOrg, OrgCard } from './org-explorer-types';
import { DEFAULT_FILTERS, NO_LANGS, effectiveSort, sortsFor, facetsOf, filterCards, filtersToParams, parseFilters, sortCards, yearRanges } from './org-explorer-filter';
import type { OrgLanguageMap } from './org-languages-shared';

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
  card('hyperledger', { programs: ['lfx'], tags: ['LFX'], lfx: { years: [2020, 2021, 2022, 2023], projects: 72, projectsByYear: { 2020: 10, 2021: 20, 2022: 22, 2023: 20 }, orgs: ['Hyperledger'], logo: null, skills: ['go', 'blockchain'], termsByYear: { 2023: [1, 2, 3] }, recent: [] } }),
];

describe('org explorer filters', () => {
  it('filters by programme, years (any of), technologies, categories, topics and search', () => {
    const f = { ...DEFAULT_FILTERS };
    expect(filterCards(cards, gsoc, { ...f, program: 'gsoc' }).map((c) => c.login)).toEqual(['sympy', 'newbie', 'oldweb', 'listed-only']);
    // the year filter also works for listed organisations without a dataset record
    expect(filterCards(cards, gsoc, { ...f, years: [2026] }).map((c) => c.login)).toEqual(['sympy', 'newbie', 'listed-only']);
    expect(filterCards(cards, gsoc, { ...f, years: [2017, 2026] }).map((c) => c.login)).toEqual(['sympy', 'newbie', 'oldweb', 'listed-only']);
    // LFX years and skills count under the LFX chip (and everywhere)
    expect(filterCards(cards, gsoc, { ...f, program: 'lfx', years: [2023] }).map((c) => c.login)).toEqual(['hyperledger']);
    expect(filterCards(cards, gsoc, { ...f, years: [2020] }).map((c) => c.login)).toEqual(['sympy', 'hyperledger']);
    expect(filterCards(cards, gsoc, { ...f, techs: ['blockchain'] }).map((c) => c.login)).toEqual(['hyperledger']);
    expect(filterCards(cards, gsoc, { ...f, search: 'Hyperledger' }).map((c) => c.login)).toEqual(['hyperledger']);
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
    expect(sortCards(g, gsoc, 'slots').map((c) => c.login)).toEqual(['sympy', 'oldweb', 'newbie']);
    expect(sortCards(g, gsoc, 'newest').map((c) => c.login)).toEqual(['newbie', 'sympy', 'oldweb']);
    expect(sortCards(g, gsoc, 'recent').map((c) => c.login)).toEqual(['sympy', 'newbie', 'oldweb']); // 2026 (8 yrs), 2026 (1 yr), 2017
    expect(sortCards(g, gsoc, 'oldest').map((c) => c.login)).toEqual(['sympy', 'oldweb', 'newbie']); // 2016 (8 yrs), 2016 (2 yrs), 2026
    expect(sortCards(g, gsoc, 'name').map((c) => c.login)).toEqual(['newbie', 'oldweb', 'sympy']);
    expect(sortCards(g, gsoc, 'name-desc').map((c) => c.login)).toEqual(['sympy', 'oldweb', 'newbie']);
    // slots and years count LFX projects too; under the LFX chip only LFX counts
    const all = [...g, cards[5]];
    expect(sortCards(all, gsoc, 'slots').map((c) => c.login)).toEqual(['hyperledger', 'sympy', 'oldweb', 'newbie']);
    expect(sortCards(all, gsoc, 'slots', NO_LANGS, [], 'gsoc').map((c) => c.login)).toEqual(['sympy', 'oldweb', 'newbie', 'hyperledger']);
    expect(sortCards(all, gsoc, 'recent', NO_LANGS, [], 'lfx')[0].login).toBe('hyperledger');
    expect(facetsOf(all, gsoc, NO_LANGS, 'lfx').years).toEqual([{ value: 2023, count: 1 }, { value: 2022, count: 1 }, { value: 2021, count: 1 }, { value: 2020, count: 1 }]);
    expect(facetsOf(all, gsoc).techs.find((t) => t.value === 'blockchain')?.count).toBe(1);
  });

  it('filters by measured GitHub languages and sorts by their share', () => {
    const langs: OrgLanguageMap = {
      sympy: { repos: 50, totalRepos: 60, languages: [['Python', 92.4, 40], ['C', 4.1, 3], ['Shell', 0.5, 12]] },
      newbie: { repos: 3, totalRepos: 3, languages: [['TypeScript', 70, 3], ['Python', 30, 1]] },
      oldweb: { repos: 9, totalRepos: 9, languages: [['PHP', 100, 9]] },
    };
    const f = { ...DEFAULT_FILTERS, langs: ['Python'] };
    const got = filterCards(cards, gsoc, f, langs);
    expect(got.map((c) => c.login)).toEqual(['sympy', 'newbie']); // listed-only and KDE have no profile yet
    expect(effectiveSort(f)).toBe('language');
    expect(sortCards(got, gsoc, 'language', langs, f.langs).map((c) => c.login)).toEqual(['sympy', 'newbie']);
    // below the noise floor does not count as "uses"
    expect(filterCards(cards, gsoc, { ...DEFAULT_FILTERS, langs: ['Shell'] }, langs)).toEqual([]);
    // every picked language must be present
    expect(filterCards(cards, gsoc, { ...DEFAULT_FILTERS, langs: ['Python', 'TypeScript'] }, langs).map((c) => c.login)).toEqual(['newbie']);
    expect(facetsOf(cards, gsoc, langs).langs).toEqual([{ value: 'Python', count: 2 }, { value: 'C', count: 1 }, { value: 'PHP', count: 1 }, { value: 'TypeScript', count: 1 }]);
    // a chosen order wins over the automatic language sort
    expect(effectiveSort({ ...f, sort: 'name' })).toBe('name');
  });

  it('counts facets over the given cards', () => {
    const fx = facetsOf(cards, gsoc);
    expect(fx.years[0]).toEqual({ value: 2026, count: 3 });
    expect(fx.years.find((y) => y.value === 2020)?.count).toBe(2); // sympy (GSoC) and hyperledger (LFX)
    expect(fx.techs.find((t) => t.value === 'python')).toEqual({ value: 'python', count: 1 });
    expect(fx.categories.map((c) => c.value)).toEqual(['Web', 'Science and medicine']);
    expect(fx.topics.find((t) => t.value === 'web')?.count).toBe(2);
  });

  it('offers programme-specific sort orders only where there is a history', () => {
    expect(sortsFor('all').map((s) => s.key)).toEqual(['recommended', 'language', 'contributors', 'name', 'name-desc']);
    expect(sortsFor('cncf').map((s) => s.key)).toEqual(['recommended', 'language', 'contributors', 'name', 'name-desc']);
    expect(sortsFor('gsoc').find((s) => s.key === 'slots')?.label).toBe('Most GSoC slots');
    expect(sortsFor('lfx').find((s) => s.key === 'newest')?.label).toBe('New to LFX');
    // a history order carried to a programme without history falls back
    expect(effectiveSort({ ...DEFAULT_FILTERS, program: 'cncf', sort: 'slots' })).toBe('recommended');
    expect(effectiveSort({ ...DEFAULT_FILTERS, program: 'lfx', sort: 'slots' })).toBe('slots');
    expect(effectiveSort({ ...DEFAULT_FILTERS, sort: 'language' })).toBe('recommended'); // no language picked
  });

  it('formats year ranges', () => {
    expect(yearRanges([2016, 2017, 2018, 2019, 2020, 2021, 2025, 2026])).toBe('2016–21, 2025–26');
    expect(yearRanges([2026])).toBe('2026');
    expect(yearRanges([])).toBe('');
  });

  it('round-trips filters through URL params and ignores junk', () => {
    const keys = new Set(['gsoc', 'lfx']);
    const f = { ...DEFAULT_FILTERS, program: 'gsoc' as const, years: [2026, 2025], techs: ['python'], langs: ['C++'], search: 'math', sort: 'newest' as const, onlyOurs: true };
    const back = parseFilters(filtersToParams(f), keys);
    expect(back).toEqual(f);
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
    expect(parseFilters(new URLSearchParams('program=nope&sort=bogus&year=abc,2024'), keys)).toEqual({ ...DEFAULT_FILTERS, years: [2024] });
  });
});
