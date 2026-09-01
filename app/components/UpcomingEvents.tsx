'use client';

import { useEffect, useState } from 'react';
import type { EventItem } from '@/lib/types';

function useCountdown(target: string) {
  const getRemaining = () => {
    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1_000);
    return { d, h, m, s, diff };
  };

  const [remaining, setRemaining] = useState(getRemaining);

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining()), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return remaining;
}

function CountdownDisplay({ target, urgent }: { target: string; urgent?: boolean }) {
  const r = useCountdown(target);

  if (!r) return (
    <span className="text-ink-soft text-xs">Ended</span>
  );

  const pad = (n: number) => String(n).padStart(2, '0');
  const strong = urgent ? 'text-error-500' : 'text-ink';
  const soft = urgent ? 'text-error-500' : 'text-ink-mid';

  if (r.d > 0) {
    return (
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-[650] tabular-nums ${strong}`}>{r.d}</span>
        <span className="text-ink-soft text-xs">d</span>
        <span className={`text-2xl font-[650] tabular-nums ${strong}`}>{pad(r.h)}</span>
        <span className="text-ink-soft text-xs">h</span>
        <span className={`text-xl font-[650] tabular-nums ${soft}`}>{pad(r.m)}</span>
        <span className="text-ink-soft text-xs">m</span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-1">
      {r.h > 0 && (
        <>
          <span className={`text-2xl font-[650] tabular-nums ${strong}`}>{r.h}</span>
          <span className="text-ink-soft text-xs">h</span>
        </>
      )}
      <span className={`text-2xl font-[650] tabular-nums ${urgent ? 'text-warning-600' : strong}`}>{pad(r.m)}</span>
      <span className="text-ink-soft text-xs">m</span>
      <span className={`text-xl font-[650] tabular-nums ${urgent ? 'text-warning-600' : soft}`}>{pad(r.s)}</span>
      <span className="text-ink-soft text-xs">s</span>
    </div>
  );
}

const TYPE_COLORS: Record<string, { text: string; chipBg: string; dot: string }> = {
  session:      { text: 'text-brand-600',   chipBg: 'bg-brand-0',   dot: 'bg-brand-500'   },
  deadline:     { text: 'text-error-600',   chipBg: 'bg-error-0',   dot: 'bg-error-500'   },
  announcement: { text: 'text-gold-600',    chipBg: 'bg-gold-0',    dot: 'bg-gold-500'    },
};

function DeadlineCard({ event }: { event: EventItem }) {
  const c = TYPE_COLORS[event.type] ?? TYPE_COLORS.session;
  const date = new Date(event.date);
  const r = useCountdown(event.date);
  const urgent = r !== null && r.diff < 24 * 3_600_000;

  const inner = (
    <div className={`relative h-full rounded-2xl bg-ground border border-line shadow-card p-5 flex flex-col gap-4 ${
      event.link ? 'cursor-pointer card-hover' : ''
    }`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-[600] px-2.5 py-1 rounded-full capitalize ${c.chipBg} ${c.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              {event.type}
            </span>
            {urgent && event.type === 'deadline' && (
              <span className="text-xs font-[600] px-2.5 py-1 rounded-full bg-error-0 text-error-600 animate-pulse">
                Closing soon
              </span>
            )}
          </div>
          <h3 className="font-[650] text-ink text-sm leading-snug">{event.title}</h3>
          <p className="text-ink-soft text-xs mt-1">
            {date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Countdown */}
        <div className="text-right shrink-0">
          {r ? (
            <CountdownDisplay target={event.date} urgent={urgent && event.type === 'deadline'} />
          ) : (
            <span className="text-ink-soft text-xs">Passed</span>
          )}
        </div>
      </div>

      <p className="text-ink-soft text-[12.5px] leading-relaxed">{event.description}</p>

      {event.link && (
        <div className={`inline-flex items-center gap-1.5 text-xs font-[600] ${c.text} self-start mt-auto`}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Learn more
        </div>
      )}
    </div>
  );

  return event.link ? (
    <a href={event.link} target="_blank" rel="noopener noreferrer" className="h-full">{inner}</a>
  ) : <div className="h-full">{inner}</div>;
}

export function UpcomingEvents({ events }: { events: EventItem[] }) {
  const [now] = useState(() => Date.now());

  const upcoming = events
    .filter((e) => new Date(e.date).getTime() > now - 86_400_000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (upcoming.length === 0) return null;

  return (
    <section className="w-full max-w-6xl mx-auto px-4 md:px-6 pb-16">
      <div className="flex items-center gap-3.5 mb-5">
        <span className="w-11 h-11 rounded-xl bg-error-0 text-error-600 flex items-center justify-center">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
          </svg>
        </span>
        <div>
          <h2 className="text-[17px] font-[650] text-ink">Upcoming events &amp; deadlines</h2>
          <p className="text-[13px] text-ink-soft mt-0.5">Sessions, program deadlines, and announcements.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {upcoming.map((e) => <DeadlineCard key={e.id} event={e} />)}
      </div>
    </section>
  );
}
