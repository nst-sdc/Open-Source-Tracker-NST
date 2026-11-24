'use client';

import { useState } from 'react';
import type { ExplorerFilters, Facets } from '@/lib/org-explorer-filter';
import type { ProgramKey } from '@/lib/org-explorer-types';
import { LANGUAGE_QUICK_PICKS, languageColor } from '@/lib/org-languages-shared';

/** The filter column: quick technology picks, GSoC years, categories,
 *  technologies and topics, each with how many organisations it keeps. */
export function FacetPanel({ facets, filters, loading, measured, program, onToggle, onClear }: {
  facets: Facets;
  filters: ExplorerFilters;
  loading: boolean;
  /** Organisations with a GitHub language profile so far. */
  measured: number;
  program: ProgramKey | 'all';
  onToggle: (kind: 'years' | 'categories' | 'techs' | 'topics' | 'langs', value: string | number) => void;
  onClear: () => void;
}) {
  const active = filters.years.length + filters.categories.length + filters.techs.length + filters.topics.length + filters.langs.length;
  const langCount = new Map(facets.langs.map((t) => [t.value, t.count]));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-ink font-[650] text-sm">Filters</h2>
        {active > 0 && <button type="button" onClick={onClear} className="text-xs text-brand-600 hover:underline underline-offset-2 cursor-pointer">Clear {active}</button>}
      </div>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-ink-soft font-[650] mb-1">I know…</h3>
        <p className="text-[11px] text-ink-faint mb-2 leading-snug">Languages GitHub measures in the code of each organisation, not what it claims. Pick one to see who really writes it, most first.</p>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGE_QUICK_PICKS.map((t) => {
            const on = filters.langs.includes(t);
            const n = langCount.get(t) ?? 0;
            return (
              <button key={t} type="button" onClick={() => onToggle('langs', t)} aria-pressed={on} disabled={!on && n === 0 && measured > 0}
                className={`inline-flex items-center gap-1.5 text-[11.5px] font-[600] px-2.5 py-1 rounded-full border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default ${on ? 'bg-brand-500 text-white border-brand-500' : 'bg-ground text-ink-mid border-line hover:border-line-strong hover:text-ink'}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: languageColor(t) }} aria-hidden="true" />
                {t}{n > 0 && <span className={`tabular-nums ${on ? 'text-white/80' : 'text-ink-faint'}`}>{n}</span>}
              </button>
            );
          })}
        </div>
        {measured === 0 && <p className="text-[11px] text-ink-faint mt-2">No organisation measured yet; the background refresh fills this in.</p>}
      </section>

      <CheckList title="Language in the code" items={facets.langs} selected={filters.langs} onToggle={(v) => onToggle('langs', v)} initial={10} searchable loading={loading} swatch />

      {(program === 'gsoc' || program === 'lfx') && (
      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-ink-soft font-[650] mb-2">{program === 'lfx' ? 'LFX year' : 'GSoC year'}</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {facets.years.map((y) => {
            const on = filters.years.includes(y.value);
            return (
              <button key={y.value} type="button" onClick={() => onToggle('years', y.value)} aria-pressed={on} title={`${y.count} organisations in ${y.value}`}
                className={`text-xs font-[600] py-1.5 rounded-lg border tabular-nums transition-colors cursor-pointer ${on ? 'bg-brand-500 text-white border-brand-500' : 'bg-ground text-ink-mid border-line hover:border-line-strong hover:text-ink'}`}>
                {y.value}
              </button>
            );
          })}
        </div>
        {facets.years.length === 0 && <p className="text-xs text-ink-faint">No mentorship history in this selection.</p>}
      </section>
      )}

      {program === 'gsoc' && <CheckList title="Category" items={facets.categories} selected={filters.categories} onToggle={(v) => onToggle('categories', v)} initial={14} />}
      <CheckList title={program === 'lfx' ? 'Skills the LFX projects asked for' : program === 'gsoc' ? 'Technology (as the org describes it)' : 'Technology or skills (self-described)'} items={facets.techs} selected={filters.techs} onToggle={(v) => onToggle('techs', v)} initial={12} searchable loading={loading} />
      {program === 'gsoc' && <CheckList title="Topic" items={facets.topics} selected={filters.topics} onToggle={(v) => onToggle('topics', v)} initial={12} searchable loading={loading} />}
    </div>
  );
}

function CheckList({ title, items, selected, onToggle, initial, searchable, loading, swatch }: {
  title: string;
  items: ReadonlyArray<{ value: string; count: number }>;
  selected: ReadonlyArray<string>;
  onToggle: (v: string) => void;
  initial: number;
  searchable?: boolean;
  loading?: boolean;
  /** Show the language's GitHub colour; values keep their case. */
  swatch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  // Selected values stay visible even when the counts no longer list them.
  const pool = query ? items.filter((i) => i.value.toLowerCase().includes(query)) : items;
  const shown = open || query ? pool : pool.slice(0, initial);
  const hidden = pool.length - shown.length;
  const missing = selected.filter((s) => !shown.some((i) => i.value === s)).map((value) => ({ value, count: 0 }));
  if (items.length === 0 && selected.length === 0) {
    return loading ? <section><h3 className="text-[11px] uppercase tracking-wider text-ink-soft font-[650] mb-2">{title}</h3><p className="text-xs text-ink-faint">Loading…</p></section> : null;
  }
  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-wider text-ink-soft font-[650] mb-2">{title}</h3>
      {searchable && items.length > initial && (
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${title.toLowerCase()}`} className="w-full mb-2 bg-ground border border-line rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-brand-100" />
      )}
      <ul className="space-y-0.5">
        {[...missing, ...shown].map((i) => {
          const on = selected.includes(i.value);
          return (
            <li key={i.value}>
              <label className={`flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 cursor-pointer select-none hover:bg-panel ${on ? 'text-ink font-[600]' : 'text-ink-mid'}`}>
                <input type="checkbox" checked={on} onChange={() => onToggle(i.value)} className="accent-brand-500" />
                {swatch && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: languageColor(i.value) }} aria-hidden="true" />}
                <span className={`flex-1 truncate ${swatch ? '' : 'capitalize'}`}>{i.value}</span>
                <span className="text-ink-faint tabular-nums">{i.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && !query && (
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-600 hover:underline underline-offset-2 mt-1 px-1.5 cursor-pointer">Show {hidden} more</button>
      )}
      {open && !query && pool.length > initial && (
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-soft hover:underline underline-offset-2 mt-1 px-1.5 cursor-pointer">Show less</button>
      )}
    </section>
  );
}
