'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEADLINES, countdown, formatCountdown, formatDate, milestoneTime, upcoming, type Deadline, type Milestone } from '@/lib/deadlines';

const DISMISS_KEY = 'deadline-postcard-dismissed';

/** A small postcard pinned to the bottom-left of every page with the soonest
 *  programme date and a live countdown. Hovering (or focusing) it unfolds the
 *  programme's story: what it is, its dates, how sure they are. Clicking it
 *  goes to that programme's page on this tracker. Published dates are solid;
 *  expected ones are marked "~". The card can be put away for the session. */
export function DeadlinePostcard() {
  // The clock starts after mount so the server and first client render agree.
  const [now, setNow] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 30_000);
    queueMicrotask(() => {
      tick();
      try { if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true); } catch { /* storage blocked: show the card */ }
    });
    return () => window.clearInterval(id);
  }, []);

  const items = upcoming(DEADLINES, now ?? Date.parse('2026-11-24T00:00:00Z'));
  if (dismissed || items.length === 0) return null;
  const [first, ...rest] = items;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* fine */ }
  };

  const remaining = (m: Milestone) => (now ? `${m.estimated ? '~' : ''}${formatCountdown(countdown(milestoneTime(m.at), now))}` : '…');
  const soon = (m: Milestone) => now !== null && milestoneTime(m.at) - now < 7 * 86_400_000;

  return (
    <aside className="group fixed bottom-4 left-4 z-50 w-[15.5rem] max-w-[calc(100vw-6rem)] select-none" aria-label="Upcoming programme dates">
      {/* Unfolds above the card under the pointer or keyboard focus. */}
      <div className="pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto opacity-0 translate-y-2 scale-[0.98] group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 transition duration-200 origin-bottom-left absolute bottom-full left-0 mb-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-ground border border-line rounded-2xl shadow-2xl p-4 space-y-4">
        <ProgrammeStory deadline={first.deadline} now={now} />
        {rest.length > 0 && (
          <ul className="border-t border-line pt-3 space-y-1.5">
            {rest.map(({ deadline, next }) => (
              <li key={deadline.id}>
                <Link href={deadline.more ?? deadline.url} className="flex items-baseline justify-between gap-3 text-xs text-ink-mid hover:text-ink rounded-md -mx-1 px-1 py-0.5 transition-colors">
                  <span><span className="font-[650] text-ink">{deadline.short}</span> · {next.label}</span>
                  <span className={`tabular-nums whitespace-nowrap font-[650] ${soon(next) ? 'text-amber-600 dark:text-amber-300' : 'text-brand-600'}`}>{remaining(next)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The postcard itself: a stamp with the countdown, the programme and its next date. */}
      <Link href={first.deadline.more ?? first.deadline.url} aria-label={`${first.deadline.program}: ${first.next.label} ${formatDate(first.next.at)}. Open the programme page.`}
        className="relative flex items-stretch gap-3 bg-ground border border-line rounded-xl shadow-card p-2.5 pr-7 hover:border-line-strong hover:shadow-2xl transition motion-safe:hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <span className={`shrink-0 flex flex-col items-center justify-center w-[4.5rem] rounded-lg border border-dashed px-1 py-1.5 text-center ${soon(first.next) ? 'border-amber-400 bg-amber-300/15 text-amber-700 dark:text-amber-300' : 'border-brand-500/50 bg-brand-500/8 text-brand-600'}`} aria-hidden="true">
          <span className="text-[12.5px] leading-none font-[750] tabular-nums whitespace-nowrap">{remaining(first.next)}</span>
          <span className="text-[9px] leading-none mt-1 uppercase tracking-wider opacity-80">left</span>
        </span>
        <span className="min-w-0 flex flex-col justify-center leading-tight">
          <span className="text-[12px] font-[700] text-ink truncate">{first.deadline.short}</span>
          <span className="text-[11px] text-ink-mid truncate">{first.next.label}</span>
          <span className="text-[10.5px] text-ink-faint tabular-nums">{formatDate(first.next.at)}{first.deadline.kind === 'expected' ? ' · expected' : ''}{rest.length > 0 ? ` · +${rest.length} more` : ''}</span>
        </span>
        <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${first.deadline.kind === 'published' ? (soon(first.next) ? 'bg-amber-400 live-dot' : 'bg-success-600') : 'ring-1 ring-ink-faint'}`} aria-hidden="true" />
      </Link>

      <button type="button" onClick={dismiss} aria-label="Hide programme dates for this visit"
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-ground border border-line text-ink-faint hover:text-ink hover:border-line-strong text-[11px] leading-none flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
        ×
      </button>
    </aside>
  );
}

function ProgrammeStory({ deadline, now }: { deadline: Deadline; now: number | null }) {
  return (
    <div className="space-y-3">
      <div>
        <span className={`inline-block text-[10px] font-[700] uppercase tracking-wider px-2 py-0.5 rounded-md ${deadline.kind === 'published' ? 'bg-success-600/10 text-success-600' : 'bg-amber-300/20 text-amber-700 dark:text-amber-300'}`}>
          {deadline.kind === 'published' ? 'Dates published' : 'Expected from past years'}
        </span>
        <h2 className="text-ink font-[700] text-[15px] leading-tight mt-1.5">{deadline.program}</h2>
      </div>
      <p className="text-xs text-ink-mid leading-relaxed">{deadline.about}</p>
      <ul className="space-y-1">
        {deadline.milestones.map((m) => {
          const t = milestoneTime(m.at);
          const past = now !== null && t <= now;
          return (
            <li key={m.at + m.label} className={`flex items-baseline justify-between gap-3 text-xs ${past ? 'text-ink-faint line-through' : 'text-ink'}`}>
              <span>{m.label}{m.estimated ? <span className="text-ink-faint"> (estimate)</span> : null}</span>
              <span className="tabular-nums whitespace-nowrap">{formatDate(m.at)}{now !== null && !past ? <span className="text-brand-600 font-[650]"> · {formatCountdown(countdown(t, now))}</span> : null}</span>
            </li>
          );
        })}
      </ul>
      <ul className="text-[11px] text-ink-mid space-y-0.5 list-disc pl-4">
        {deadline.facts.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <p className="text-[10.5px] text-ink-faint leading-snug">{deadline.source}</p>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-ink-faint">Click the card for the programme page</span>
        <a href={deadline.url} target="_blank" rel="noopener noreferrer" className="font-[600] text-brand-600 hover:underline">Official site ↗</a>
      </div>
    </div>
  );
}
