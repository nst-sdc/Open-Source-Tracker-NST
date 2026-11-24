'use client';

import { useEffect, useRef, useState } from 'react';
import type { GsocProject } from '@/lib/org-explorer-types';
import { gsocOfficialOrgUrl } from '@/lib/org-explorer-types';

type State = { status: 'loading' } | { status: 'ok'; projects: GsocProject[]; source: 'official' | 'archive'; ideasListUrl?: string } | { status: 'error'; reason: string };

/** An organisation's GSoC projects by year, from the official GSoC site:
 *  pick a year, read the titles, open the project or its code. */
/** `members`: for an umbrella, the lower-case logins of its member projects; a
 *  project's code owner is shown only when it is one of them, since the other
 *  owners are the contributors' own forks. */
export function GsocProjects({ slug, years, onIdeasList, members }: { slug: string; years: ReadonlyArray<number>; onIdeasList?: (url: string) => void; members?: ReadonlySet<string> }) {
  const member = (owner: string | undefined) => !!owner && !!members && members.has(owner.toLowerCase());
  const sorted = [...years].sort((a, b) => b - a);
  const [year, setYear] = useState<number>(sorted[0]);
  const [state, setState] = useState<Record<number, State>>({});
  // Years already requested, so switching tabs and back neither refetches nor
  // (as an effect cleanup would) cancels a request still in flight.
  const requested = useRef(new Set<number>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!year || requested.current.has(year)) return;
    requested.current.add(year);
    // Loading state for this year, then the answer; both come from the fetch, not from render.
    queueMicrotask(() => { if (alive.current) setState((s) => (s[year] ? s : { ...s, [year]: { status: 'loading' } })); });
    fetch(`/api/gsoc-projects?slug=${encodeURIComponent(slug)}&year=${year}`)
      .then(async (r) => {
        const body = (await r.json()) as { ok: boolean; projects?: GsocProject[]; source?: 'official' | 'archive'; ideasListUrl?: string; reason?: string };
        if (alive.current) setState((s) => ({ ...s, [year]: body.ok && body.projects ? { status: 'ok', projects: body.projects, source: body.source ?? 'official', ideasListUrl: body.ideasListUrl } : { status: 'error', reason: body.reason ?? 'unavailable' } }));
        // The newest year's ideas list is the one an applicant wants; it is the first tab, so the first answer.
        if (alive.current && body.ok && body.ideasListUrl && year === sorted[0]) onIdeasList?.(body.ideasListUrl);
      })
      .catch(() => { if (alive.current) setState((s) => ({ ...s, [year]: { status: 'error', reason: 'unavailable' } })); requested.current.delete(year); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch per slug and year; the callback and tab order are stable for the sheet's life
  }, [slug, year]);

  if (sorted.length === 0) return null;
  const cur = state[year];
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-ink font-[650] text-sm">GSoC projects</h3>
        <a href={gsocOfficialOrgUrl(slug, year)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-600 hover:underline underline-offset-2">On the official site ↗</a>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Year">
        {sorted.map((y) => (
          <button key={y} type="button" role="tab" aria-selected={y === year} onClick={() => setYear(y)}
            className={`text-xs font-[600] px-2.5 py-1 rounded-lg border tabular-nums transition-colors cursor-pointer ${y === year ? 'bg-brand-500 text-white border-brand-500' : 'bg-ground text-ink-mid border-line hover:border-line-strong hover:text-ink'}`}>
            {y}
          </button>
        ))}
      </div>
      {!cur || cur.status === 'loading' ? (
        <p className="text-xs text-ink-faint">Loading {year} projects from summerofcode.withgoogle.com…</p>
      ) : cur.status === 'error' ? (
        <p className="text-xs text-ink-faint">{cur.reason === 'not-found' ? `The official site lists no ${year} projects for this organisation.` : 'The official site did not answer; try again in a moment.'}</p>
      ) : cur.projects.length === 0 ? (
        <p className="text-xs text-ink-faint">No projects listed for {year}.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {cur.projects.map((p) => (
              <li key={p.url} className="text-xs">
                <div className="flex items-start gap-2">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-ink font-[600] hover:text-brand-600 hover:underline underline-offset-2 leading-snug flex-1">{p.title}</a>
                  {p.codeUrl && (
                    <a href={p.codeUrl} target="_blank" rel="noopener noreferrer" title="Code or final report" className="text-ink-faint hover:text-brand-600 shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>
                    </a>
                  )}
                </div>
                {(member(p.codeOwner) || p.contributor || p.mentors?.length) && (
                  <div className="text-ink-faint mt-0.5 truncate">
                    {member(p.codeOwner) && <a href={`https://github.com/${p.codeOwner}`} target="_blank" rel="noopener noreferrer" title="The member project this was mentored in" className="text-brand-700 font-[600] hover:underline underline-offset-2">{p.codeOwner}</a>}
                    {member(p.codeOwner) && (p.contributor || p.mentors?.length) ? ' · ' : ''}
                    {p.contributor && <span>{p.contributor}</span>}
                    {p.contributor && p.mentors?.length ? ' · ' : ''}
                    {p.mentors?.length ? <span>mentored by {p.mentors.slice(0, 2).join(', ')}{p.mentors.length > 2 ? ` +${p.mentors.length - 2}` : ''}</span> : null}
                  </div>
                )}
                {p.summary && <p className="text-ink-mid mt-0.5 line-clamp-2 leading-snug">{p.summary}</p>}
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] text-ink-faint mt-2">{cur.projects.length} project{cur.projects.length === 1 ? '' : 's'} · {cur.source === 'official' ? 'official GSoC API' : 'official GSoC archive pages'}</p>
        </>
      )}
    </section>
  );
}
