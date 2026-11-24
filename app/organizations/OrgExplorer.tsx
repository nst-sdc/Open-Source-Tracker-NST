'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PROGRAM_FILTERS, type GsocOrg, type OrgCard, type OrgExplorerData, type ProgramKey } from '@/lib/org-explorer-types';
import {
  EMPTY_FACETS, NO_LANGS, activeFacetCount, sortsFor, effectiveSort, facetsOf, filterCards, filtersToParams, langsOf, parseFilters, sortCards, toggleIn, yearsOf,
  type ExplorerFilters, type GsocMap, type LangMap, type SortKey,
} from '@/lib/org-explorer-filter';
import type { OrgLanguageMap } from '@/lib/org-languages-shared';
import { OrgCardView } from './OrgCardView';
import { OrgSheet } from './OrgSheet';
import { FacetPanel } from './Facets';

const PAGE = 48;
const PROGRAM_KEYS: ReadonlySet<string> = new Set(PROGRAM_FILTERS.map((f) => f.key));
/** Programme chips with fewer organisations than this stay hidden (still reachable by URL). */
const MIN_CHIP_ORGS = 5;
const EMPTY: GsocMap = new Map();

/** Mirror the selection into the address bar without a server round trip:
 *  the native history API is integrated with Next's router. */
function syncUrl(f: ExplorerFilters) {
  const qs = filtersToParams(f).toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

export function OrgExplorer({ data }: { data: OrgExplorerData }) {
  const params = useSearchParams();
  // The URL is the source of truth for the selection, so any view can be shared.
  const [filters, setFilters] = useState<ExplorerFilters>(() => parseFilters(new URLSearchParams(params.toString()), PROGRAM_KEYS));
  const [limit, setLimit] = useState(PAGE);
  const [gsoc, setGsoc] = useState<GsocMap>(EMPTY);
  const [langs, setLangs] = useState<LangMap>(NO_LANGS);
  const [loading, setLoading] = useState(true);
  const [openLogin, setOpenLogin] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/gsoc-orgs', { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<GsocOrg[]>) : Promise.reject(new Error(String(r.status)))))
      .then((list) => { setGsoc(new Map(list.map((o) => [o.slug, o]))); setLoading(false); })
      .catch(() => { if (!ctrl.signal.aborted) setLoading(false); });
    // What GitHub says each organisation's code is written in; filled in by the refresh tick.
    fetch('/api/org-languages', { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<OrgLanguageMap>) : Promise.reject(new Error(String(r.status)))))
      .then((map) => setLangs(map))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // The next state is computed in the handler and the URL synced there, never
  // inside a state updater, which React runs during render.
  const apply = useCallback((next: ExplorerFilters) => {
    setFilters(next);
    setLimit(PAGE);
    syncUrl(next);
  }, []);

  const update = useCallback((patch: Partial<ExplorerFilters>) => {
    apply({ ...filters, ...patch });
  }, [apply, filters]);

  const toggle = useCallback((kind: 'years' | 'categories' | 'techs' | 'topics' | 'langs', value: string | number) => {
    apply(kind === 'years'
      ? { ...filters, years: toggleIn(filters.years, Number(value)) }
      : { ...filters, [kind]: toggleIn(filters[kind] as string[], String(value)) });
  }, [apply, filters]);

  // Facet counts ignore the facets themselves so each option shows what it would keep.
  const base = useMemo(() => filterCards(data.cards, gsoc, { ...filters, ...EMPTY_FACETS }, langs), [data.cards, gsoc, filters, langs]);
  const facets = useMemo(() => facetsOf(base, gsoc, langs, filters.program), [base, gsoc, langs, filters.program]);
  const sort = effectiveSort(filters);
  const shown = useMemo(() => sortCards(filterCards(data.cards, gsoc, filters, langs), gsoc, sort, langs, filters.langs, filters.program), [data.cards, gsoc, filters, langs, sort]);
  const measured = useMemo(() => Object.keys(langs).length, [langs]);

  const visible = shown.slice(0, limit);
  const totalContributors = new Set(shown.flatMap((c) => c.people)).size;
  const withOurs = shown.filter((c) => c.contributors > 0).length;
  const current = filters.program === 'all' ? null : PROGRAM_FILTERS.find((f) => f.key === filters.program) ?? null;
  // Every programme gets the language facets; the history facets appear per programme inside the panel.
  const showFacets = true;
  const open = openLogin ? data.cards.find((c) => c.login === openLogin) ?? null : null;
  // From one sheet to another (an umbrella to a member and back), by login in any case.
  const openByLogin = (login: string) => {
    const hit = data.cards.find((c) => c.login.toLowerCase() === login.toLowerCase());
    if (hit) setOpenLogin(hit.login);
    return !!hit;
  };
  const facetCount = activeFacetCount(filters);

  const pickFromSheet = (kind: 'tech' | 'topic' | 'category' | 'lang', value: string) => {
    setOpenLogin(null);
    const key = kind === 'tech' ? 'techs' : kind === 'topic' ? 'topics' : kind === 'lang' ? 'langs' : 'categories';
    if (!(filters[key] as string[]).includes(value)) toggle(key, value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chips: Array<{ label: string; clear: () => void }> = [
    ...filters.langs.map((v) => ({ label: `${v} code`, clear: () => toggle('langs', v) })),
    ...filters.years.map((y) => ({ label: `${filters.program === 'lfx' ? 'LFX' : filters.program === 'gsoc' ? 'GSoC' : 'Year'} ${y}`, clear: () => toggle('years', y) })),
    ...filters.categories.map((v) => ({ label: v, clear: () => toggle('categories', v) })),
    ...filters.techs.map((v) => ({ label: v, clear: () => toggle('techs', v) })),
    ...filters.topics.map((v) => ({ label: v, clear: () => toggle('topics', v) })),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 pb-20 space-y-5">
      {/* Programme chips */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Programme">
        {[{ key: 'all' as const, label: 'All', hint: 'Every organisation' }, ...PROGRAM_FILTERS].map((f) => {
          const n = data.counts[f.key];
          const active = filters.program === f.key;
          // A programme with a handful of organisations is not worth a chip; its tag still shows on the cards.
          if (n.orgs < MIN_CHIP_ORGS && !active) return null;
          return (
            <button key={f.key} type="button" role="radio" aria-checked={active} title={f.hint} onClick={() => update({ program: f.key })}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-[550] border transition-colors cursor-pointer ${active ? 'bg-brand-500/15 text-brand-600 border-brand-100' : 'bg-ground text-ink-mid border-line hover:text-ink hover:border-line-strong'}`}>
              {f.label}
              <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-md ${active ? 'bg-brand-500/15' : 'bg-panel-2'}`}>{n.orgs}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <input type="search" value={filters.search} onChange={(e) => update({ search: e.target.value })} placeholder="Search by name, technology or topic (e.g. rust, bioinformatics)"
          className="flex-1 bg-ground border border-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-brand-100" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-ink-mid">
            <span className="text-ink-soft">Sort</span>
            <select value={sort} onChange={(e) => update({ sort: e.target.value as SortKey })} className="bg-ground border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-100 cursor-pointer">
              {sortsFor(filters.program).filter((s) => s.key !== 'language' || filters.langs.length > 0).map((s) => <option key={s.key} value={s.key} title={s.hint}>{s.label}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-ink-mid cursor-pointer select-none">
            <input type="checkbox" checked={filters.onlyOurs} onChange={(e) => update({ onlyOurs: e.target.checked })} className="accent-brand-500" />
            Only where NST contributes
          </label>
          {showFacets && (
            <button type="button" onClick={() => setDrawer(true)} className="lg:hidden inline-flex items-center gap-2 bg-ground border border-line rounded-xl px-3 py-2 text-sm text-ink-mid hover:text-ink cursor-pointer">
              Filters{facetCount > 0 && <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-md bg-brand-500/15 text-brand-600">{facetCount}</span>}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-ink-soft">
        <span className="text-ink font-[650] tabular-nums">{shown.length}</span> organisation{shown.length === 1 ? '' : 's'}{current ? ` in ${current.label}` : ''}
        {' · '}<span className="text-ink font-[650] tabular-nums">{withOurs}</span> with NST contributors
        {' · '}<span className="text-ink font-[650] tabular-nums">{totalContributors}</span> of us contributing
        {filters.langs.length > 0 && <span className="block md:inline md:ml-2 text-ink-faint">Sorted by how much of the code GitHub measures as {filters.langs.join(' and ')}, across the most-starred repositories of each organisation{measured < data.cards.length ? `; ${measured} of ${data.cards.length} organisations measured so far` : ''}.</span>}
        {current?.hint && !filters.langs.length && <span className="block md:inline md:ml-2 text-ink-faint">{current.hint}</span>}
      </p>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((ch) => (
            <button key={ch.label} type="button" onClick={ch.clear} className="inline-flex items-center gap-1 text-xs font-[600] px-2.5 py-1 rounded-full bg-brand-500 text-white hover:bg-brand-600 transition-colors cursor-pointer capitalize">
              {ch.label}<span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" onClick={() => update(EMPTY_FACETS)} className="text-xs text-ink-soft hover:text-ink underline-offset-2 hover:underline ml-1 cursor-pointer">Clear all</button>
        </div>
      )}

      <div className={`grid gap-6 ${showFacets ? 'lg:grid-cols-[260px_minmax(0,1fr)]' : ''}`}>
        {showFacets && (
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 -mr-2 bg-ground border border-line rounded-2xl p-4">
              <FacetPanel facets={facets} filters={filters} loading={loading} measured={measured} program={filters.program} onToggle={toggle} onClear={() => update(EMPTY_FACETS)} />
            </div>
          </aside>
        )}

        <div className="space-y-5 min-w-0">
          {visible.length === 0 ? (
            <div className="text-center py-16 bg-ground border border-line rounded-2xl text-ink-soft">
              <p className="text-sm font-[500]">Nothing matches.</p>
              <p className="text-xs text-ink-faint mt-1">{filters.onlyOurs ? 'Untick "only where NST contributes" to see every organisation.' : facetCount > 0 ? 'Clear a filter or two.' : 'Try another programme or search.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((c) => (
                <OrgCardView key={c.login} card={c} meta={c.gsocSlug ? gsoc.get(c.gsocSlug) : undefined} years={yearsOf(c, gsoc, filters.program)} program={filters.program} profile={langsOf(c, langs)} picked={filters.langs}
                  onOpen={() => setOpenLogin(c.login)} onPickTech={(t) => { if (!filters.techs.includes(t)) toggle('techs', t); }} onPickLang={(l) => { if (!filters.langs.includes(l)) toggle('langs', l); }} />
              ))}
            </div>
          )}
          {visible.length < shown.length && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="bg-ground border border-line-strong hover:bg-panel text-ink font-[550] px-5 py-2.5 rounded-xl text-sm transition-colors cursor-pointer">
                Show {Math.min(PAGE, shown.length - visible.length)} more of {shown.length - visible.length}
              </button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <OrgSheet card={open} meta={open.gsocSlug ? gsoc.get(open.gsocSlug) : undefined} years={yearsOf(open, gsoc, 'gsoc')} profile={langsOf(open, langs)}
          onMeasured={(login, profile) => setLangs((m) => ({ ...m, [login.toLowerCase()]: profile }))}
          onClose={() => setOpenLogin(null)} onPick={pickFromSheet} onOpen={openByLogin} />
      )}

      {drawer && showFacets && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" aria-label="Close filters" onClick={() => setDrawer(false)} className="absolute inset-0 bg-ink/40 cursor-default" />
          <div className="absolute left-0 top-0 h-full w-[88%] max-w-sm bg-ground border-r border-line overflow-y-auto p-4">
            <FacetPanel facets={facets} filters={filters} loading={loading} measured={measured} program={filters.program} onToggle={toggle} onClear={() => update(EMPTY_FACETS)} />
            <button type="button" onClick={() => setDrawer(false)} className="mt-5 w-full bg-brand-500 text-white font-[600] rounded-xl py-2.5 text-sm cursor-pointer">Show {shown.length} organisation{shown.length === 1 ? '' : 's'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { OrgCard, ProgramKey };
