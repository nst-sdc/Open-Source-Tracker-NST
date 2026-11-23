'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PROGRAM_FILTERS, type OrgCard, type OrgExplorerData, type ProgramKey } from '@/lib/org-explorer-types';

const PAGE = 48;

export function OrgExplorer({ data }: { data: OrgExplorerData }) {
  const [program, setProgram] = useState<ProgramKey | 'all'>('all');
  // Every organisation by default; the switch narrows to the ones with our contributors.
  const [onlyOurs, setOnlyOurs] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.cards.filter((c) =>
      (program === 'all' || c.programs.includes(program)) &&
      (!onlyOurs || c.contributors > 0) &&
      (!q || c.login.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)),
    );
  }, [data.cards, program, onlyOurs, search]);

  const visible = shown.slice(0, limit);
  const totalContributors = new Set(shown.flatMap((c) => c.people)).size;
  const current = program === 'all' ? null : PROGRAM_FILTERS.find((f) => f.key === program) ?? null;

  const pick = (key: ProgramKey | 'all') => { setProgram(key); setLimit(PAGE); };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 pb-20 space-y-6">
      {/* Programme chips */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Programme">
        {[{ key: 'all' as const, label: 'All', hint: 'Every organisation' }, ...PROGRAM_FILTERS].map((f) => {
          const n = data.counts[f.key];
          const active = program === f.key;
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={active}
              title={f.hint}
              onClick={() => pick(f.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-[550] border transition-colors cursor-pointer ${active ? 'bg-brand-500/15 text-brand-600 border-brand-100' : 'bg-ground text-ink-mid border-line hover:text-ink hover:border-line-strong'}`}
            >
              {f.label}
              <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-md ${active ? 'bg-brand-500/15' : 'bg-panel-2'}`}>
                {n.withContributors}<span className="opacity-60">/{n.orgs}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          <span className="text-ink font-[650] tabular-nums">{shown.length}</span> organisation{shown.length === 1 ? '' : 's'}
          {current ? ` in ${current.label}` : ''}
          {onlyOurs ? ' with our contributors' : ''}
          {' · '}
          <span className="text-ink font-[650] tabular-nums">{totalContributors}</span> of our students contributing
          {current?.hint && <span className="block md:inline md:ml-2 text-ink-faint">{current.hint}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-ink-mid cursor-pointer select-none">
            <input type="checkbox" checked={onlyOurs} onChange={(e) => { setOnlyOurs(e.target.checked); setLimit(PAGE); }} className="accent-brand-500" />
            Only with our contributors
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
            placeholder="Search organisations"
            className="bg-ground border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-brand-100 w-full md:w-64"
          />
        </div>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="text-center py-16 bg-ground border border-line rounded-2xl text-ink-soft">
          <p className="text-sm font-[500]">Nothing matches.</p>
          <p className="text-xs text-ink-faint mt-1">{onlyOurs ? 'Untick "only with our contributors" to see every organisation in this programme.' : 'Try another programme or search.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((c) => <OrgCardView key={c.login} card={c} />)}
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
  );
}

function OrgCardView({ card: c }: { card: OrgCard }) {
  const hasOurs = c.contributors > 0;
  // Clicking the organisation opens the repo activity page on the repository
  // we have merged into most there; for one we have not reached, GitHub.
  const activityHref = c.topRepo ? `/repo-activity?repo=${encodeURIComponent(c.topRepo.repo)}&period=month` : null;
  return (
    <div className="relative bg-ground border border-line rounded-2xl p-4 shadow-card card-hover flex flex-col gap-3">
      {activityHref ? (
        <Link href={activityHref} aria-label={`Open repo activity for ${c.name}`} title={`Repo activity: ${c.topRepo!.repo} (${c.topRepo!.merged} of our merges)`} className="absolute inset-0 rounded-2xl" />
      ) : (
        <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${c.name} on GitHub`} className="absolute inset-0 rounded-2xl" />
      )}
      <div className="flex items-start gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- GitHub avatar by login, no loader */}
        <img src={c.avatarUrl} alt="" className="w-11 h-11 rounded-xl ring-1 ring-line object-cover shrink-0 bg-panel-2" loading="lazy" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-ink font-[650] text-[14.5px] leading-snug truncate" title={c.name}>{c.name}</div>
              <div className="text-ink-soft text-xs truncate">@{c.login}</div>
            </div>
            <a href={c.url} target="_blank" rel="noopener noreferrer" title="Open on GitHub" className="relative text-ink-faint hover:text-brand-600 transition-colors shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          </div>
          {c.description && <p className="text-ink-mid text-xs mt-1 line-clamp-2 leading-snug">{c.description}</p>}
        </div>
      </div>

      {c.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.tags.map((t) => <span key={t} className="text-[10.5px] font-[600] px-2 py-0.5 rounded-full bg-violet-0 text-violet-600 border border-violet-100">{t}</span>)}
        </div>
      )}

      <div className="relative flex items-end justify-between gap-3 mt-auto pt-1">
        <div>
          <div className="text-[11px] text-ink-soft">Our contributors</div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-[700] tabular-nums ${hasOurs ? 'text-ink' : 'text-ink-faint'}`}>{c.contributors}</span>
            {hasOurs && <span className="text-[11px] text-success-600 tabular-nums font-[600]">{c.mergedPRs} merged</span>}
          </div>
        </div>
        {hasOurs ? (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {c.top.map((t) => (
                // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar by login
                <img key={t.login} src={`https://github.com/${t.login}.png?size=48`} alt={t.login} title={`${t.login} · ${t.merged} merged`} className="w-7 h-7 rounded-full ring-2 ring-ground object-cover bg-panel-2" loading="lazy" />
              ))}
            </div>
            <Link href={`/contributors?org=${encodeURIComponent(c.login)}`} className="relative text-xs font-[600] text-brand-600 hover:underline underline-offset-2 whitespace-nowrap">
              See contributors
            </Link>
          </div>
        ) : (
          <span className="relative text-[11px] text-ink-faint">Nobody from NST yet — be the first</span>
        )}
      </div>
    </div>
  );
}
