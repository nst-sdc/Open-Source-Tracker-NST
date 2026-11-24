'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEADLINES, countdown, formatCountdown, formatDate, milestoneTime, upcoming, type Deadline } from '@/lib/deadlines';

/** A thin rolling strip on every page: the next date of each programme with a
 *  live countdown. Click an item to read what the programme is, its dates and
 *  how sure they are. Published dates are solid; expected ones say so. */
export function DeadlineTicker() {
  // The clock starts after mount so the server and first client render agree.
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState<Deadline | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 30_000);
    queueMicrotask(tick);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const items = upcoming(DEADLINES, now ?? Date.parse('2026-11-24T00:00:00Z'));
  if (items.length === 0) return null;

  const row = (keyPrefix: string, hidden: boolean) => (
    <ul className="flex items-center gap-8 pr-8 shrink-0" aria-hidden={hidden}>
      {items.map(({ deadline, next }) => {
        const c = now ? formatCountdown(countdown(milestoneTime(next.at), now)) : '…';
        const soon = now ? milestoneTime(next.at) - now < 7 * 86_400_000 : false;
        return (
          <li key={`${keyPrefix}-${deadline.id}`} className="shrink-0">
            <button type="button" onClick={() => setOpen(deadline)} tabIndex={hidden ? -1 : 0}
              className="group inline-flex items-center gap-2 text-[12px] leading-none cursor-pointer hover:text-white transition-colors">
              <span className={`w-1.5 h-1.5 rounded-full ${deadline.kind === 'published' ? (soon ? 'bg-amber-300 live-dot' : 'bg-emerald-300') : 'bg-white/40 ring-1 ring-white/60'}`} aria-hidden="true" />
              <span className="font-[650]">{deadline.short}</span>
              <span className="text-white/75">{next.label}</span>
              <span className="text-white/60 tabular-nums">{formatDate(next.at)}</span>
              <span className={`tabular-nums font-[700] px-1.5 py-0.5 rounded-md ${soon ? 'bg-amber-300 text-ink' : 'bg-white/15'}`}>{next.estimated ? '~' : ''}{c}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <div className="sticky top-0 z-[60] h-7 overflow-hidden bg-gradient-to-r from-violet-700 via-brand-600 to-violet-700 text-white select-none" role="region" aria-label="Upcoming programme dates">
        <div className="ticker-track flex h-full items-center">
          {row('a', false)}
          {row('b', true)}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={open.program}>
          <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] cursor-default" />
          <div className="absolute left-1/2 top-16 -translate-x-1/2 w-[min(32rem,calc(100vw-2rem))] bg-ground border border-line rounded-2xl shadow-2xl p-5 space-y-4 panel-enter">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-block text-[10.5px] font-[700] uppercase tracking-wider px-2 py-0.5 rounded-md ${open.kind === 'published' ? 'bg-success-600/10 text-success-600' : 'bg-amber-300/20 text-amber-700 dark:text-amber-300'}`}>
                  {open.kind === 'published' ? 'Dates published' : 'Expected from past years'}
                </span>
                <h2 className="text-ink font-[700] text-lg leading-tight mt-2">{open.program}</h2>
              </div>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="text-ink-faint hover:text-ink p-1 -m-1 cursor-pointer">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <p className="text-sm text-ink-mid leading-relaxed">{open.about}</p>
            <ul className="space-y-1.5">
              {open.milestones.map((m) => {
                const t = milestoneTime(m.at);
                const past = now !== null && t <= now;
                return (
                  <li key={m.at + m.label} className={`flex items-baseline justify-between gap-3 text-sm ${past ? 'text-ink-faint line-through' : 'text-ink'}`}>
                    <span>{m.label}{m.estimated ? <span className="text-ink-faint"> (estimate)</span> : null}</span>
                    <span className="tabular-nums whitespace-nowrap">{formatDate(m.at)}{now !== null && !past ? <span className="text-brand-600 font-[650]"> · {formatCountdown(countdown(t, now))}</span> : null}</span>
                  </li>
                );
              })}
            </ul>
            <ul className="text-xs text-ink-mid space-y-1 list-disc pl-4">
              {open.facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <p className="text-[11px] text-ink-faint leading-snug">{open.source}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={open.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-[600] px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">Official site ↗</a>
              {open.more && <Link href={open.more} onClick={() => setOpen(null)} className="inline-flex items-center text-xs font-[600] px-3 py-1.5 rounded-lg bg-ground border border-line text-ink-mid hover:text-ink hover:border-line-strong transition-colors">On this tracker</Link>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
