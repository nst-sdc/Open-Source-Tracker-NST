'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { GsocOrg, OrgCard } from '@/lib/org-explorer-types';
import { GSOC_FIRST_YEAR, GSOC_LAST_YEAR, gsocHistoryUrl, goodFirstIssuesUrl } from '@/lib/org-explorer-types';
import { OrgLogo, YearsLine } from './OrgCardView';
import { languageColor, LANGUAGE_MIN_SHARE, type OrgLanguageProfile } from '@/lib/org-languages-shared';

/** The side panel for one organisation: what it is, its GSoC history,
 *  what it builds with, who from NST is already there, and where to start. */
export function OrgSheet({ card: c, meta, years, profile, onClose, onPick }: {
  card: OrgCard;
  meta?: GsocOrg;
  years: ReadonlyArray<number>;
  profile?: OrgLanguageProfile;
  onClose: () => void;
  onPick: (kind: 'tech' | 'topic' | 'category' | 'lang', value: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const website = meta?.url ?? (c.site ? c.url : null);
  const activityHref = c.topRepo ? `/repo-activity?repo=${encodeURIComponent(c.topRepo.repo)}&period=month` : null;
  const allYears = Array.from({ length: GSOC_LAST_YEAR - GSOC_FIRST_YEAR + 1 }, (_, i) => GSOC_FIRST_YEAR + i);
  const maxProjects = Math.max(1, ...Object.values(meta?.projectsByYear ?? {}));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={c.name}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] cursor-default" />
      <aside className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-ground border-l border-line shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-ground/95 backdrop-blur border-b border-line px-5 py-4 flex items-start gap-3 z-10">
          <OrgLogo card={c} meta={meta} size="w-14 h-14" />
          <div className="min-w-0 flex-1">
            <h2 className="text-ink font-[700] text-lg leading-tight">{c.name}</h2>
            <div className="text-ink-soft text-xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {meta?.category && (
                <button type="button" onClick={() => onPick('category', meta.category)} className="hover:text-brand-600 underline-offset-2 hover:underline cursor-pointer">{meta.category}</button>
              )}
              {!c.site && <span>@{c.login}</span>}
              {c.tags.filter((t) => t !== 'GSoC').map((t) => <span key={t} className="text-[10.5px] font-[600] px-2 py-0.5 rounded-full bg-violet-0 text-violet-600 border border-violet-100">{t}</span>)}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition-colors p-1 -m-1 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Links */}
          <div className="flex flex-wrap gap-2">
            {website && <LinkChip href={website} label="Website" />}
            {!c.site && <LinkChip href={c.url} label="GitHub" />}
            {!c.site && <LinkChip href={goodFirstIssuesUrl(c.login)} label="Good first issues" accent />}
            {meta && <LinkChip href={gsocHistoryUrl(meta.slug)} label="Past GSoC projects" />}
            {activityHref && (
              <Link href={activityHref} className="inline-flex items-center gap-1.5 text-xs font-[600] px-3 py-1.5 rounded-lg bg-brand-500/15 text-brand-600 border border-brand-100 hover:bg-brand-500/25 transition-colors">
                Repo activity · {c.topRepo!.repo.split('/')[1]}
              </Link>
            )}
          </div>

          {c.description && <p className="text-ink-mid text-sm leading-relaxed">{c.description}</p>}

          {/* GSoC history */}
          {years.length > 0 && (
            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-ink font-[650] text-sm">GSoC history</h3>
                <YearsLine years={years} />
              </div>
              <div className="grid grid-cols-11 gap-1 items-end h-16">
                {allYears.map((y) => {
                  const active = years.includes(y);
                  const n = meta?.projectsByYear[String(y)] ?? 0;
                  const h = active ? Math.max(14, Math.round((n / maxProjects) * 100)) : 6;
                  return (
                    <div key={y} className="flex flex-col items-center justify-end h-full" title={active ? `${y}: ${n || '?'} project${n === 1 ? '' : 's'}` : `${y}: not in GSoC`}>
                      <div className={`w-full rounded-sm ${active ? 'bg-brand-400' : 'bg-panel-2'}`} style={{ height: `${h}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-11 gap-1 mt-1">
                {allYears.map((y) => <div key={y} className="text-center text-[9px] text-ink-faint tabular-nums">{String(y).slice(2)}</div>)}
              </div>
              {meta && meta.projects > 0 && (
                <p className="text-xs text-ink-soft mt-2 tabular-nums">{meta.projects} students mentored over {years.length} year{years.length === 1 ? '' : 's'}, about {Math.round(meta.projects / years.length)} a year.</p>
              )}
            </section>
          )}

          {/* Languages, as GitHub measures them */}
          {!c.site && (
            <section>
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <h3 className="text-ink font-[650] text-sm">Languages in the code</h3>
                {profile && <span className="text-[11px] text-ink-faint tabular-nums">GitHub, {profile.repos < profile.totalRepos ? `${profile.repos} most-starred of ${profile.totalRepos}` : `all ${profile.repos}`} repositories</span>}
              </div>
              {profile ? (
                <>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-panel-2" role="img" aria-label={profile.languages.map(([n, p]) => `${n} ${p}%`).join(', ')}>
                    {profile.languages.filter(([, p]) => p >= LANGUAGE_MIN_SHARE).map(([name, pct]) => (
                      <div key={name} title={`${name} ${pct}%`} style={{ width: `${pct}%`, backgroundColor: languageColor(name) }} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
                    {profile.languages.filter(([, p]) => p >= LANGUAGE_MIN_SHARE).map(([name, pct, repos]) => (
                      <button key={name} type="button" onClick={() => onPick('lang', name)} title={`${repos} of the sampled repositories use ${name}. Show organisations whose code has ${name}.`} className="inline-flex items-center gap-1.5 text-[11.5px] hover:underline underline-offset-2 cursor-pointer">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: languageColor(name) }} aria-hidden="true" />
                        <span className="text-ink-mid">{name}</span>
                        <span className="text-ink-faint tabular-nums">{pct}%</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-ink-faint">Not measured yet; the background refresh reads the repositories from GitHub within a day.</p>
              )}
            </section>
          )}

          {meta && meta.technologies.length > 0 && (
            <Facet title="Technologies, as the organisation describes them" items={meta.technologies} onPick={(v) => onPick('tech', v)} tone="brand" />
          )}
          {meta && meta.topics.length > 0 && (
            <Facet title="Topics" items={meta.topics} onPick={(v) => onPick('topic', v)} tone="violet" />
          )}

          {/* NST */}
          <section className="bg-panel border border-line rounded-2xl p-4">
            <h3 className="text-ink font-[650] text-sm">From NST</h3>
            {c.contributors > 0 ? (
              <>
                <p className="text-xs text-ink-soft mt-1 tabular-nums"><span className="text-ink font-[650]">{c.contributors}</span> of us have merged work here, <span className="text-ink font-[650]">{c.mergedPRs}</span> pull requests in total.</p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex -space-x-2">
                    {c.top.map((t) => (
                      // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar by login
                      <img key={t.login} src={`https://github.com/${t.login}.png?size=64`} alt={t.login} title={`${t.login} · ${t.merged} merged`} className="w-8 h-8 rounded-full ring-2 ring-panel object-cover bg-panel-2" />
                    ))}
                  </div>
                  <div className="text-xs text-ink-mid truncate">{c.top.map((t) => t.login).join(', ')}</div>
                </div>
                <Link href={`/contributors?org=${encodeURIComponent(c.login)}`} className="inline-block mt-3 text-xs font-[600] text-brand-600 hover:underline underline-offset-2">See all contributors →</Link>
              </>
            ) : (
              <p className="text-xs text-ink-soft mt-1">Nobody from NST has merged here yet. {c.site ? 'Start from the website.' : 'Start with the good first issues above, or read the contributing guide on GitHub.'}</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function LinkChip({ href, label, accent }: { href: string; label: string; accent?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-xs font-[600] px-3 py-1.5 rounded-lg border transition-colors ${accent ? 'bg-success-600/10 text-success-600 border-success-600/20 hover:bg-success-600/20' : 'bg-ground text-ink-mid border-line hover:text-ink hover:border-line-strong'}`}>
      {label}
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4h6m0 0v6m0-6L10 14" /></svg>
    </a>
  );
}

function Facet({ title, items, onPick, tone }: { title: string; items: ReadonlyArray<string>; onPick: (v: string) => void; tone: 'brand' | 'violet' }) {
  const cls = tone === 'brand' ? 'bg-brand-0 text-brand-700 border-brand-100 hover:bg-brand-100' : 'bg-violet-0 text-violet-600 border-violet-100 hover:bg-violet-100';
  return (
    <section>
      <h3 className="text-ink font-[650] text-sm mb-2">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <button key={t} type="button" onClick={() => onPick(t)} title={`Show organisations with ${t}`} className={`text-[11px] font-[600] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${cls}`}>{t}</button>
        ))}
      </div>
    </section>
  );
}
