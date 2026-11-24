'use client';

import Link from 'next/link';
import type { GsocOrg, OrgCard, ProgramKey } from '@/lib/org-explorer-types';
import { GSOC_FIRST_YEAR, GSOC_LAST_YEAR, LFX_FIRST_YEAR, LFX_LAST_YEAR } from '@/lib/org-explorer-types';
import { yearRanges } from '@/lib/org-explorer-filter';
import { languageColor, shareOf, type OrgLanguageProfile } from '@/lib/org-languages-shared';

/** Top languages of the organisation's code with GitHub's colours; the picked
 *  ones first and bold so a filtered list reads at a glance. */
export function LanguageStrip({ profile, picked, onPick, max = 3 }: { profile: OrgLanguageProfile; picked: ReadonlyArray<string>; onPick?: (lang: string) => void; max?: number }) {
  const pickedFirst = [
    ...picked.map((p) => profile.languages.find((l) => l[0].toLowerCase() === p.toLowerCase())).filter((l): l is NonNullable<typeof l> => !!l),
    ...profile.languages.filter((l) => !picked.some((p) => p.toLowerCase() === l[0].toLowerCase())),
  ].slice(0, max);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {pickedFirst.map(([name, pct]) => {
        const hot = picked.some((p) => p.toLowerCase() === name.toLowerCase());
        const inner = (
          <>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: languageColor(name) }} aria-hidden="true" />
            <span className={hot ? 'text-ink font-[650]' : 'text-ink-mid'}>{name}</span>
            <span className={`tabular-nums ${hot ? 'text-brand-600 font-[650]' : 'text-ink-faint'}`}>{pct}%</span>
          </>
        );
        return onPick ? (
          <button key={name} type="button" onClick={() => onPick(name)} title={`Only organisations whose code has ${name}`} className="inline-flex items-center gap-1.5 text-[11px] hover:underline underline-offset-2 cursor-pointer">{inner}</button>
        ) : (
          <span key={name} className="inline-flex items-center gap-1.5 text-[11px]">{inner}</span>
        );
      })}
    </div>
  );
}

export function OrgLogo({ card, meta, size = 'w-12 h-12' }: { card: OrgCard; meta?: GsocOrg; size?: string }) {
  // GitHub's avatar for organisations we know on GitHub; the GSoC logo for the rest.
  const src = card.site ? (meta?.image ?? card.avatarUrl) : card.avatarUrl || meta?.image || '';
  if (!src) return <div className={`${size} rounded-xl ring-1 ring-line bg-panel-2 shrink-0 grid place-items-center text-ink-faint font-[700]`}>{card.name.slice(0, 1)}</div>;
  // eslint-disable-next-line @next/next/no-img-element -- remote logos by URL, no loader
  return <img src={src} alt="" className={`${size} rounded-xl ring-1 ring-line object-contain shrink-0 bg-white`} loading="lazy" />;
}

/** "11 yrs · 2016–26" with a highlight when the organisation is in the current year. */
export function YearsLine({ years, label = 'GSoC' }: { years: ReadonlyArray<number>; label?: string }) {
  if (years.length === 0) return null;
  const current = years.includes(GSOC_LAST_YEAR);
  const first = Math.min(...years);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft whitespace-nowrap">
      {first === GSOC_LAST_YEAR ? (
        <span className="font-[650] px-1.5 py-0.5 rounded-md bg-success-600/10 text-success-600">New in {GSOC_LAST_YEAR}</span>
      ) : current ? (
        <span className="font-[650] px-1.5 py-0.5 rounded-md bg-success-600/10 text-success-600">{label} {GSOC_LAST_YEAR}</span>
      ) : null}
      <span className="tabular-nums">{label !== 'GSoC' ? `${label} · ` : ''}{years.length} {years.length === 1 ? 'yr' : 'yrs'} · {yearRanges(years)}</span>
    </span>
  );
}

/** Which programme's history a card shows: the selected one, else GSoC, else LFX. */
function historyProgram(card: OrgCard, program: ProgramKey | 'all', hasGsoc: boolean): 'gsoc' | 'lfx' | null {
  if (program === 'lfx' && card.lfx) return 'lfx';
  if (hasGsoc) return 'gsoc';
  if (card.lfx) return 'lfx';
  return null;
}

export function OrgCardView({ card: c, meta, years, program, profile, picked, onOpen, onPickTech, onPickLang }: {
  card: OrgCard;
  meta?: GsocOrg;
  /** Years for the current view (see yearsOf). */
  years: ReadonlyArray<number>;
  program: ProgramKey | 'all';
  /** GitHub-measured languages, when the organisation has been measured. */
  profile?: OrgLanguageProfile;
  /** Languages the user filtered on. */
  picked: ReadonlyArray<string>;
  onOpen: () => void;
  onPickTech: (tech: string) => void;
  onPickLang: (lang: string) => void;
}) {
  const hasOurs = c.contributors > 0;
  const allTechs = meta?.technologies ?? c.lfx?.skills ?? [];
  const techs = allTechs.slice(0, 4);
  const more = allTechs.length - techs.length;
  const pickedShare = picked.length > 0 && profile ? picked.map((l) => `${l} ${shareOf(profile, l)}%`).join(' · ') : null;
  const gsocYears = meta?.years ?? c.years ?? [];
  const which = historyProgram(c, program, gsocYears.length > 0);
  const flips = which !== null;
  const yearsLabel = which === 'lfx' ? 'LFX' : 'GSoC';
  const face = 'bg-ground border border-line rounded-2xl shadow-card group-hover:shadow-card-hover group-hover:border-line-heavy transition-[box-shadow,border-color] duration-300';

  const front = (
    <div className={`relative ${face} org-flip-face p-4 flex flex-col gap-3 h-full focus-within:border-brand-100`}>
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
        <YearsLine years={which === 'lfx' ? (c.lfx?.years ?? []) : years} label={yearsLabel} />
        <span className="text-[11px] text-ink-soft tabular-nums whitespace-nowrap">
          {which === 'lfx' && c.lfx ? `${c.lfx.projects} LFX project${c.lfx.projects === 1 ? '' : 's'}` : meta && meta.projects > 0 ? `${meta.projects} GSoC projects` : ''}
          {which === 'gsoc' && c.lfx ? ` · ${c.lfx.projects} LFX` : ''}
        </span>
      </div>

      {profile && (
        <div className="relative flex items-center justify-between gap-2">
          <LanguageStrip profile={profile} picked={picked} onPick={onPickLang} />
          {pickedShare && <span className="text-[10.5px] text-ink-faint whitespace-nowrap">of the code</span>}
        </div>
      )}

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

  if (!flips) return <div className="group h-full">{front}</div>;

  return (
    <div className="group org-flip h-full">
      <div className="org-flip-inner">
        {front}
        <SlotsBack card={c} meta={meta} years={which === 'lfx' ? (c.lfx?.years ?? []) : gsocYears} program={which ?? 'gsoc'} onOpen={onOpen} face={face} />
      </div>
    </div>
  );
}

/** The back of the card: the organisation's GSoC slots per year, 2016–2026,
 *  a box per year with the number of projects (or a tick when the count is
 *  unknown), so histories can be compared at a glance without opening each one. */
function SlotsBack({ card: c, meta, years, program, onOpen, face }: { card: OrgCard; meta?: GsocOrg; years: ReadonlyArray<number>; program: 'gsoc' | 'lfx'; onOpen: () => void; face: string }) {
  const lfx = program === 'lfx';
  const [firstYear, lastYear] = lfx ? [LFX_FIRST_YEAR, LFX_LAST_YEAR] : [GSOC_FIRST_YEAR, GSOC_LAST_YEAR];
  const allYears = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const byYear = lfx ? c.lfx?.projectsByYear : meta?.projectsByYear;
  const total = (lfx ? c.lfx?.projects : meta?.projects) ?? 0;
  const label = lfx ? 'LFX' : 'GSoC';
  return (
    <button type="button" onClick={onOpen} aria-hidden="true" tabIndex={-1} className={`${face} org-flip-face org-flip-back p-4 flex flex-col text-left cursor-pointer w-full`}>
      <div className="text-center min-w-0">
        <div className="text-ink font-[650] text-[14.5px] leading-snug truncate">{c.name}</div>
        <div className="text-[10px] uppercase tracking-wider text-ink-soft font-[650] mt-0.5">{label} slots by year</div>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 my-auto py-3">
        {allYears.map((y) => {
          const active = years.includes(y);
          const n = byYear?.[String(y)];
          return (
            <div key={y} title={active ? `${y}: ${n ?? 'some'} project${n === 1 ? '' : 's'}` : `${y}: not in ${label}`}
              className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center tabular-nums ${active ? (lfx ? 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-sm' : 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm') : 'bg-panel-2 text-ink-faint border border-line'}`}>
              <span className={`text-[9px] leading-none ${active ? 'text-white/80' : ''}`}>{y}</span>
              <span className="text-[13px] font-[700] leading-tight mt-0.5">{active ? (n ?? '✓') : '–'}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-ink-soft tabular-nums">
        <span>{total > 0 ? `${total} projects over ${years.length} yr${years.length === 1 ? '' : 's'}` : `${years.length} yr${years.length === 1 ? '' : 's'} in ${label}`}</span>
        <span className="text-brand-600 font-[600]">Click for details →</span>
      </div>
    </button>
  );
}
