'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GsocOrg, OrgCard, UmbrellaDetail, UmbrellaParent } from '@/lib/org-explorer-types';
import { GSOC_FIRST_YEAR, GSOC_LAST_YEAR, LFX_FIRST_YEAR, LFX_LAST_YEAR, PROGRAM_FILTERS, gsocOfficialOrgUrl, goodFirstIssuesUrl, umbrellaMembers } from '@/lib/org-explorer-types';
import { GsocProjects } from './GsocProjects';
import { OrgLogo, YearsLine } from './OrgCardView';
import { languageColor, LANGUAGE_MIN_SHARE, type OrgLanguageProfile } from '@/lib/org-languages-shared';

/** The side panel for one organisation: what it is, its GSoC history,
 *  what it builds with, who from NST is already there, and where to start. */
export function OrgSheet({ card: c, meta, years, profile, onMeasured, onClose, onPick, onOpen }: {
  card: OrgCard;
  meta?: GsocOrg;
  years: ReadonlyArray<number>;
  profile?: OrgLanguageProfile;
  /** A profile measured on demand for this organisation, to merge into the page's map. */
  onMeasured: (login: string, profile: OrgLanguageProfile) => void;
  onClose: () => void;
  onPick: (kind: 'tech' | 'topic' | 'category' | 'lang', value: string) => void;
  /** Open another organisation's sheet by login, when the explorer has a card for it. */
  onOpen?: (login: string) => boolean;
}) {
  // The organisation's current GSoC ideas list, once the projects section has read it from the official site.
  const [ideasList, setIdeasList] = useState<string | null>(null);
  // For an umbrella: its sub-organisations, fetched when the sheet opens (undefined while loading, null when missing).
  const [umbrella, setUmbrella] = useState<UmbrellaDetail | null | undefined>(undefined);
  useEffect(() => {
    if (!c.umbrella || !c.gsocSlug) return;
    let alive = true;
    fetch(`/api/gsoc-umbrellas?slug=${encodeURIComponent(c.gsocSlug)}`)
      .then(async (r) => { if (alive) setUmbrella(r.ok ? ((await r.json()) as UmbrellaDetail) : null); })
      .catch(() => { if (alive) setUmbrella(null); });
    return () => { alive = false; };
  }, [c.umbrella, c.gsocSlug]);
  // No profile yet: ask the server to measure this organisation now.
  const [measuring, setMeasuring] = useState<'idle' | 'busy' | 'none' | 'failed'>('idle');
  useEffect(() => {
    if (profile || c.site || c.umbrella) return;
    let alive = true;
    queueMicrotask(() => { if (alive) setMeasuring('busy'); });
    fetch(`/api/org-languages?login=${encodeURIComponent(c.login)}`)
      .then(async (r) => {
        const body = (await r.json()) as { profile: OrgLanguageProfile | null; measured: boolean };
        if (!alive) return;
        if (body.profile) { onMeasured(c.login, body.profile); setMeasuring('idle'); } else setMeasuring(body.measured ? 'none' : 'failed');
      })
      .catch(() => { if (alive) setMeasuring('failed'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per organisation
  }, [c.login, c.site, c.umbrella]);
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
  const slots = c.gsocSlots ?? meta?.projectsByYear ?? {};
  const maxProjects = Math.max(1, ...Object.values(slots));
  const slotTotal = Object.values(slots).reduce((a, n) => a + n, 0);

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
            {ideasList && <LinkChip href={ideasList} label="GSoC ideas list" accent />}
            {meta && years.length > 0 && <LinkChip href={gsocOfficialOrgUrl(meta.slug, Math.max(...years))} label="On GSoC site" />}
            {activityHref && (
              <Link href={activityHref} className="inline-flex items-center gap-1.5 text-xs font-[600] px-3 py-1.5 rounded-lg bg-brand-500/15 text-brand-600 border border-brand-100 hover:bg-brand-500/25 transition-colors">
                Repo activity · {c.topRepo!.repo.split('/')[1]}
              </Link>
            )}
          </div>

          {c.description && <p className="text-ink-mid text-sm leading-relaxed">{c.description}</p>}

          {/* Umbrella: where the slots actually go */}
          {c.umbrella && <UmbrellaSection card={c} detail={umbrella} onOpen={onOpen} />}

          {/* Member project: which umbrella it ran GSoC projects under */}
          {c.via && !c.umbrella && <ViaSection card={c} parents={c.via} onOpen={onOpen} />}

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
                  const n = slots[String(y)] ?? 0;
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
              {slotTotal > 0 && (
                <p className="text-xs text-ink-soft mt-2 tabular-nums">{slotTotal} students mentored over {years.length} year{years.length === 1 ? '' : 's'}, about {Math.round(slotTotal / years.length)} a year.</p>
              )}
            </section>
          )}

          {meta && years.length > 0 && <GsocProjects slug={meta.slug} years={years} onIdeasList={setIdeasList} members={c.umbrella && umbrella ? new Set(umbrellaMembers(umbrella).map((m) => m.login.toLowerCase())) : undefined} />}

          {/* LFX Mentorship history */}
          {c.lfx && <LfxHistorySection lfx={c.lfx} onPick={onPick} />}

          {/* Languages, as GitHub measures them */}
          {c.umbrella && !c.site && (
            <section>
              <h3 className="text-ink font-[650] text-sm mb-1">Languages in the code</h3>
              <p className="text-xs text-ink-soft">Each member project has its own stack, so there is no single profile for an umbrella. Open a member project above to see its languages.</p>
            </section>
          )}
          {!c.site && !c.umbrella && (
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
              ) : measuring === 'busy' || measuring === 'idle' ? (
                <p className="text-xs text-ink-faint">Reading the repositories on GitHub…</p>
              ) : measuring === 'none' ? (
                <p className="text-xs text-ink-faint">GitHub lists no public code for this organisation.</p>
              ) : (
                <p className="text-xs text-ink-faint">GitHub did not answer just now; the background refresh will fill this in.</p>
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

const LFX_YEARS = Array.from({ length: LFX_LAST_YEAR - LFX_FIRST_YEAR + 1 }, (_, i) => LFX_FIRST_YEAR + i);

/** An umbrella's member organisations, as the GSoC projects' code links name
 *  them. Partial by nature: many projects link a blog post or nothing. */
function UmbrellaSection({ card, detail, onOpen }: { card: OrgCard; detail: UmbrellaDetail | null | undefined; onOpen?: (login: string) => boolean }) {
  const programLabel = card.umbrella?.program ? PROGRAM_FILTERS.find((p) => p.key === card.umbrella!.program)?.label : undefined;
  const years = detail ? Object.keys(detail.subOrgsByYear).map(Number).sort((a, b) => b - a) : [];
  const [year, setYear] = useState<number | null>(null);
  const shownYear = year && years.includes(year) ? year : years[0];
  const subs = detail && shownYear ? detail.subOrgsByYear[String(shownYear)] : [];
  const members = detail ? umbrellaMembers(detail) : [];
  const shownMembers = members.slice(0, 24);
  return (
    <section className="rounded-xl border border-brand-100 bg-brand-0/60 p-3">
      <h3 className="text-ink font-[650] text-sm">Umbrella organisation</h3>
      <p className="text-xs text-ink-mid mt-1 leading-relaxed">
        GSoC counts the slots for {card.name} as one organisation, but each project is mentored inside a sub-organisation, and that is where the code and the maintainers are.
      </p>
      {detail === undefined && <p className="text-[11px] text-ink-faint mt-2">Loading the sub-organisations…</p>}
      {detail && years.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2 mt-2.5">
            <p className="text-[11px] text-ink-faint">Sub-organisations on the {shownYear} ideas list, as {card.name} published it.</p>
            <div className="flex gap-1 shrink-0">
              {years.map((y) => (
                <button key={y} type="button" onClick={() => setYear(y)} className={`text-[10.5px] tabular-nums px-1.5 py-0.5 rounded-md cursor-pointer transition-colors ${y === shownYear ? 'bg-brand-500 text-white' : 'bg-ground border border-line text-ink-mid hover:text-ink'}`}>{y}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {subs.map((s) => {
              const owner = s.github?.split('/')[0];
              const cls = 'inline-flex items-center gap-1 text-[11px] font-[600] px-2 py-0.5 rounded-full bg-ground border border-line text-ink-mid hover:text-ink hover:border-line-strong transition-colors';
              const chip = s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" title="Its ideas page" className={cls}>{s.name}</a>
              ) : owner ? (
                <MemberChip login={owner} title={s.github!} onOpen={onOpen}>{s.name}</MemberChip>
              ) : (
                <span className={cls} title="No link on the ideas list">{s.name}</span>
              );
              return (
                <span key={s.name} className="inline-flex items-center gap-0.5">
                  {chip}
                  {s.github && s.url && (
                    <a href={`https://github.com/${s.github}`} target="_blank" rel="noopener noreferrer" title={`github.com/${s.github}`} onClick={(e) => { if (owner && onOpen && onOpen(owner)) e.preventDefault(); }}
                      className="text-ink-faint hover:text-brand-600 p-0.5">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .5A11.5 11.5 0 000 12a11.5 11.5 0 007.9 10.9c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 015.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0024 12 11.5 11.5 0 0012 .5z" /></svg>
                    </a>
                  )}
                </span>
              );
            })}
          </div>
        </>
      )}
      {detail && years.length === 0 && (
        <p className="text-[11px] text-ink-faint mt-2">Its ideas list names project ideas rather than sub-organisations, so there is no list to show here.</p>
      )}
      {shownMembers.length > 0 && (
        <>
          <p className="text-[11px] text-ink-faint mt-3">Where past GSoC projects&rsquo; code went, most projects first (from the projects&rsquo; code links; projects that linked no code are not counted).</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {shownMembers.map((m) => (
              <MemberChip key={m.login} login={m.login} title={`${m.projects} project${m.projects === 1 ? '' : 's'} · ${m.years.join(', ')}${Object.keys(m.repos).length ? ` · in ${Object.keys(m.repos).slice(0, 4).join(', ')}` : ''}`} onOpen={onOpen}>
                {m.login}<span className="text-ink-faint tabular-nums font-[500]">{m.projects}</span>
              </MemberChip>
            ))}
            {members.length > shownMembers.length && <span className="text-[11px] px-1.5 py-0.5 text-ink-faint">+{members.length - shownMembers.length} more</span>}
          </div>
        </>
      )}
      {card.umbrella?.program && (
        <Link href={`/organizations?program=${card.umbrella.program}`} className="inline-block mt-2 text-xs font-[600] text-brand-600 hover:underline underline-offset-2">Browse every {programLabel ?? 'member'} project here →</Link>
      )}
    </section>
  );
}

/** A chip that opens the organisation's sheet here when there is one, and its GitHub page otherwise. */
function MemberChip({ login, title, onOpen, children }: { login: string; title: string; onOpen?: (login: string) => boolean; children: React.ReactNode }) {
  const cls = 'inline-flex items-center gap-1 text-[11px] font-[600] px-2 py-0.5 rounded-full bg-ground border border-line text-ink-mid hover:text-ink hover:border-line-strong transition-colors cursor-pointer';
  return (
    <a href={`https://github.com/${login}`} target="_blank" rel="noopener noreferrer" title={title} className={cls}
      onClick={(e) => { if (onOpen && onOpen(login)) e.preventDefault(); }}>
      {children}
    </a>
  );
}

/** The umbrellas a member project ran its GSoC projects under. */
function ViaSection({ card, parents, onOpen }: { card: OrgCard; parents: ReadonlyArray<UmbrellaParent>; onOpen?: (login: string) => boolean }) {
  return (
    <section className="rounded-xl border border-line bg-panel/60 p-3">
      <h3 className="text-ink font-[650] text-sm">GSoC through an umbrella</h3>
      <p className="text-xs text-ink-mid mt-1 leading-relaxed">GSoC lists this organisation&rsquo;s projects under an umbrella; the mentoring, the code and the maintainers are here. The years come from the umbrella&rsquo;s ideas lists and from where past projects&rsquo; code went.</p>
      <ul className="mt-2 space-y-1.5">
        {parents.map((p) => (
          <li key={p.slug} className="text-xs">
            <div className="flex items-baseline justify-between gap-3">
              {p.login ? (
                <MemberChip login={p.login} title={`Open ${p.name}`} onOpen={onOpen}>{p.name}</MemberChip>
              ) : (
                <span className="font-[600] text-ink-mid">{p.name}</span>
              )}
              {p.projects > 0 && <span className="text-ink-soft tabular-nums whitespace-nowrap">{p.projects} project{p.projects === 1 ? '' : 's'} · {p.years.join(', ')}</span>}
            </div>
            {p.listed.length > 0 && <div className="text-[11px] text-ink-faint mt-0.5 tabular-nums">On its ideas list: {p.listed.join(', ')}</div>}
          </li>
        ))}
      </ul>
      {parents.some((p) => Object.keys(p.repos).length > 0) && (
        <div className="mt-2">
          <p className="text-[11px] text-ink-faint">Repositories those projects were in:</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {parents.flatMap((p) => Object.entries(p.repos).map(([repo, n]) => ({ p, repo, n }))).slice(0, 12).map(({ p, repo, n }) => (
              <a key={`${p.slug}/${repo}`} href={`https://github.com/${card.login}/${repo}`} target="_blank" rel="noopener noreferrer" title={`${n} project${n === 1 ? '' : 's'}`}
                className="inline-flex items-center gap-1 text-[11px] font-[600] px-2 py-0.5 rounded-full bg-ground border border-line text-ink-mid hover:text-ink hover:border-line-strong transition-colors">
                {repo}<span className="text-ink-faint tabular-nums font-[500]">{n}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function LfxHistorySection({ lfx, onPick }: { lfx: NonNullable<OrgCard['lfx']>; onPick: (kind: 'tech', value: string) => void }) {
  const max = Math.max(1, ...Object.values(lfx.projectsByYear));
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-ink font-[650] text-sm">LFX Mentorship history</h3>
        <YearsLine years={lfx.years} label="LFX" />
      </div>
      {lfx.orgs.length > 0 && <p className="text-xs text-ink-soft mb-2">On LFX as {lfx.orgs.join(', ')}.</p>}
      <div className="grid grid-cols-8 gap-1 items-end h-16">
        {LFX_YEARS.map((y) => {
          const n = lfx.projectsByYear[String(y)] ?? 0;
          const terms = lfx.termsByYear[String(y)] ?? [];
          return (
            <div key={y} className="flex flex-col items-center justify-end h-full" title={n ? `${y}: ${n} project${n === 1 ? '' : 's'}${terms.length ? `, term${terms.length === 1 ? '' : 's'} ${terms.join(', ')}` : ''}` : `${y}: no LFX projects`}>
              <div className={`w-full rounded-sm ${n ? 'bg-violet-500' : 'bg-panel-2'}`} style={{ height: `${n ? Math.max(14, Math.round((n / max) * 100)) : 6}%` }} />
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-8 gap-1 mt-1">
        {LFX_YEARS.map((y) => <div key={y} className="text-center text-[9px] text-ink-faint tabular-nums">{String(y).slice(2)}</div>)}
      </div>
      <p className="text-xs text-ink-soft mt-2 tabular-nums">{lfx.projects} mentorship project{lfx.projects === 1 ? '' : 's'} over {lfx.years.length} year{lfx.years.length === 1 ? '' : 's'}; up to three terms a year. History covers 2019–2023.</p>
      {lfx.skills.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] text-ink-soft mb-1.5">Skills the projects asked for</div>
          <div className="flex flex-wrap gap-1.5">
            {lfx.skills.map((t) => (
              <button key={t} type="button" onClick={() => onPick('tech', t)} title={`Show organisations asking for ${t}`} className="text-[11px] font-[600] px-2.5 py-1 rounded-full border transition-colors cursor-pointer bg-violet-0 text-violet-600 border-violet-100 hover:bg-violet-100">{t}</button>
            ))}
          </div>
        </div>
      )}
      {lfx.recent.length > 0 && (
        <ul className="mt-3 space-y-1">
          {lfx.recent.slice(0, 5).map((p) => (
            <li key={`${p.year}-${p.term}-${p.name}`} className="text-xs flex items-baseline gap-2 min-w-0">
              <span className="text-ink-faint tabular-nums whitespace-nowrap">{p.year} T{p.term}</span>
              <a href={p.repo} target="_blank" rel="noopener noreferrer" className="text-ink-mid hover:text-brand-600 hover:underline underline-offset-2 truncate" title={p.name}>{p.name}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
