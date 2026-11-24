'use client';

import Link from 'next/link';
import type { GsocOrg, OrgCard } from '@/lib/org-explorer-types';
import { GSOC_LAST_YEAR } from '@/lib/org-explorer-types';
import { yearRanges } from '@/lib/org-explorer-filter';

export function OrgLogo({ card, meta, size = 'w-12 h-12' }: { card: OrgCard; meta?: GsocOrg; size?: string }) {
  // GitHub's avatar for organisations we know on GitHub; the GSoC logo for the rest.
  const src = card.site ? (meta?.image ?? card.avatarUrl) : card.avatarUrl || meta?.image || '';
  if (!src) return <div className={`${size} rounded-xl ring-1 ring-line bg-panel-2 shrink-0 grid place-items-center text-ink-faint font-[700]`}>{card.name.slice(0, 1)}</div>;
  // eslint-disable-next-line @next/next/no-img-element -- remote logos by URL, no loader
  return <img src={src} alt="" className={`${size} rounded-xl ring-1 ring-line object-contain shrink-0 bg-white`} loading="lazy" />;
}

/** "11 yrs · 2016–26" with a highlight when the organisation is in the current year. */
export function YearsLine({ years }: { years: ReadonlyArray<number> }) {
  if (years.length === 0) return null;
  const current = years.includes(GSOC_LAST_YEAR);
  const first = Math.min(...years);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft whitespace-nowrap">
      {first === GSOC_LAST_YEAR ? (
        <span className="font-[650] px-1.5 py-0.5 rounded-md bg-success-600/10 text-success-600">New in {GSOC_LAST_YEAR}</span>
      ) : current ? (
        <span className="font-[650] px-1.5 py-0.5 rounded-md bg-success-600/10 text-success-600">GSoC {GSOC_LAST_YEAR}</span>
      ) : null}
      <span className="tabular-nums">{years.length} {years.length === 1 ? 'yr' : 'yrs'} · {yearRanges(years)}</span>
    </span>
  );
}

export function OrgCardView({ card: c, meta, years, onOpen, onPickTech }: {
  card: OrgCard;
  meta?: GsocOrg;
  years: ReadonlyArray<number>;
  onOpen: () => void;
  onPickTech: (tech: string) => void;
}) {
  const hasOurs = c.contributors > 0;
  const techs = meta?.technologies.slice(0, 4) ?? [];
  const more = (meta?.technologies.length ?? 0) - techs.length;
  return (
    <div className="relative bg-ground border border-line rounded-2xl p-4 shadow-card card-hover flex flex-col gap-3 focus-within:border-brand-100">
      <button type="button" onClick={onOpen} aria-label={`Open details for ${c.name}`} className="absolute inset-0 rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300" />
      <div className="flex items-start gap-3 min-w-0 pointer-events-none">
        <OrgLogo card={c} meta={meta} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-ink font-[650] text-[14.5px] leading-snug truncate" title={c.name}>{c.name}</div>
              <div className="text-ink-soft text-xs truncate">
                {meta?.category ? <span>{meta.category}</span> : c.site ? <span>Website</span> : <span>@{c.login}</span>}
                {!c.site && meta?.category && <span className="text-ink-faint"> · @{c.login}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 pointer-events-auto shrink-0 mt-0.5">
              {(meta?.url ?? (c.site ? c.url : null)) && (
                <a href={meta?.url ?? c.url} target="_blank" rel="noopener noreferrer" title="Website" className="relative text-ink-faint hover:text-brand-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth={1.5} /><path strokeWidth={1.5} d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>
                </a>
              )}
              {!c.site && (
                <a href={c.url} target="_blank" rel="noopener noreferrer" title="Open on GitHub" className="relative text-ink-faint hover:text-brand-600 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .5A11.5 11.5 0 000 12a11.5 11.5 0 007.9 10.9c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 015.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0024 12 11.5 11.5 0 0012 .5z" /></svg>
                </a>
              )}
            </div>
          </div>
          {c.description && <p className="text-ink-mid text-xs mt-1.5 line-clamp-2 leading-snug">{c.description}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pointer-events-none">
        <YearsLine years={years} />
        {meta && meta.projects > 0 && <span className="text-[11px] text-ink-soft tabular-nums whitespace-nowrap">{meta.projects} GSoC projects</span>}
      </div>

      {techs.length > 0 && (
        <div className="relative flex flex-wrap gap-1.5">
          {techs.map((t) => (
            <button key={t} type="button" onClick={() => onPickTech(t)} title={`Only organisations using ${t}`} className="text-[10.5px] font-[600] px-2 py-0.5 rounded-full bg-brand-0 text-brand-700 border border-brand-100 hover:bg-brand-100 transition-colors cursor-pointer">
              {t}
            </button>
          ))}
          {more > 0 && <span className="text-[10.5px] px-1.5 py-0.5 text-ink-faint">+{more}</span>}
        </div>
      )}
      {!meta && c.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pointer-events-none">
          {c.tags.map((t) => <span key={t} className="text-[10.5px] font-[600] px-2 py-0.5 rounded-full bg-violet-0 text-violet-600 border border-violet-100">{t}</span>)}
        </div>
      )}

      <div className="relative flex items-end justify-between gap-3 mt-auto pt-1 pointer-events-none">
        <div>
          <div className="text-[11px] text-ink-soft">From NST</div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-[700] tabular-nums ${hasOurs ? 'text-ink' : 'text-ink-faint'}`}>{c.contributors}</span>
            {hasOurs ? (
              <span className="text-[11px] text-success-600 tabular-nums font-[600]">{c.mergedPRs} merged</span>
            ) : (
              <span className="text-[11px] text-ink-faint">no one yet — open to you</span>
            )}
          </div>
        </div>
        {hasOurs && (
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="flex -space-x-2">
              {c.top.map((t) => (
                // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar by login
                <img key={t.login} src={`https://github.com/${t.login}.png?size=48`} alt={t.login} title={`${t.login} · ${t.merged} merged`} className="w-7 h-7 rounded-full ring-2 ring-ground object-cover bg-panel-2" loading="lazy" />
              ))}
            </div>
            <Link href={`/contributors?org=${encodeURIComponent(c.login)}`} className="relative text-xs font-[600] text-brand-600 hover:underline underline-offset-2 whitespace-nowrap">
              See who
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
