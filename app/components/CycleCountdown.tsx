'use client';

import { useSyncExternalStore } from 'react';
import {
  PROGRAM_SCHEDULES,
  breakdown,
  formatCycleDate,
  formatCycleRange,
  resolveNextCycle,
  type NextCycle,
} from '@/lib/program-cycles';

/*
 * A single shared ticker drives every countdown on the page — sixteen programs
 * with their own interval each would be sixteen timers doing identical work.
 *
 * The server snapshot is 0, and so is the first client render, so hydration
 * matches; the real clock only takes over once the store is subscribed.
 */
const subscribers = new Set<() => void>();
let currentNow = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void) {
  subscribers.add(onChange);

  if (!timer) {
    currentNow = Date.now();
    timer = setInterval(() => {
      currentNow = Date.now();
      subscribers.forEach((fn) => fn());
    }, 1000);
  }

  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time in epoch ms, or 0 before the component has mounted. */
function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => currentNow,
    () => 0,
  );
}

/** Resolves the cycle for a program against the live clock. `null` until mounted. */
function useCycle(programId: string): { now: number; cycle: NextCycle | null; rolling: boolean } {
  const now = useNow();
  const schedule = PROGRAM_SCHEDULES[programId];
  const rolling = schedule?.rolling ?? false;

  return {
    now,
    cycle: now === 0 || !schedule ? null : resolveNextCycle(schedule, now),
    rolling,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

function Unit({ value, unit, size }: { value: string; unit: string; size: 'sm' | 'lg' }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span
        className={`tabular-nums font-[650] text-ink ${size === 'lg' ? 'text-2xl' : 'text-sm'}`}
      >
        {value}
      </span>
      <span className={`text-ink-soft ${size === 'lg' ? 'text-xs' : 'text-[11px]'}`}>{unit}</span>
    </span>
  );
}

/**
 * The digits themselves. Under a day the seconds are shown, above it they are
 * noise — nobody refreshing a page three weeks out needs a second hand.
 */
function Digits({ target, now, size }: { target: number; now: number; size: 'sm' | 'lg' }) {
  const left = breakdown(target, now);
  if (!left) return <span className="text-ink-soft text-xs">Any moment now</span>;

  const gap = size === 'lg' ? 'gap-2.5' : 'gap-1.5';

  return (
    <span className={`inline-flex items-baseline ${gap}`}>
      {left.days > 0 && <Unit value={String(left.days)} unit="d" size={size} />}
      <Unit value={pad(left.hours)} unit="h" size={size} />
      <Unit value={pad(left.minutes)} unit="m" size={size} />
      {left.days === 0 && <Unit value={pad(left.seconds)} unit="s" size={size} />}
    </span>
  );
}

/** Same width as a rendered countdown, so nothing jumps when the clock arrives. */
function Placeholder({ size }: { size: 'sm' | 'lg' }) {
  return (
    <span className={`text-ink-faint tabular-nums ${size === 'lg' ? 'text-2xl' : 'text-sm'}`}>
      ––d ––h ––m
    </span>
  );
}

/**
 * Full-width band shown under a program's header on /programs.
 *
 * Three states: the window is open (count down to its close), the window is
 * ahead (count down to its open), or the program takes applications year-round.
 */
export function ProgramCycleCountdown({ programId }: { programId: string }) {
  const { now, cycle, rolling } = useCycle(programId);

  if (rolling) {
    return (
      <div className="px-6 py-4 border-t border-line flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-success-400" />
        <span className="text-ink-mid text-xs font-[500]">Rolling applications</span>
        <span className="text-ink-soft text-xs">— no cycle to wait for, apply any time.</span>
      </div>
    );
  }

  if (!PROGRAM_SCHEDULES[programId]) return null;

  const open = cycle?.isOpen ?? false;
  const target = cycle ? (open ? cycle.closesAt : cycle.opensAt) : 0;

  return (
    <div className="px-6 py-4 border-t border-line flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-success-400 animate-pulse' : 'bg-brand-400'}`}
          />
          <span className="text-ink-soft text-xs uppercase tracking-wide">
            {open ? 'Applications open now' : 'Next cycle opens in'}
          </span>
        </div>
        <div className="text-ink-mid text-xs">
          {cycle ? (
            <>
              {cycle.label} ·{' '}
              {open
                ? `closes ${formatCycleDate(cycle.closesAt, now)}`
                : formatCycleRange(cycle.opensAt, cycle.closesAt, now)}
            </>
          ) : (
            <span className="text-ink-faint">Checking the schedule…</span>
          )}
        </div>
      </div>

      <div className="sm:text-right">
        {cycle ? <Digits target={target} now={now} size="lg" /> : <Placeholder size="lg" />}
        <div className="text-ink-faint text-[11px] mt-0.5">
          {open ? 'until applications close' : 'approximate — verify on the official site'}
        </div>
      </div>
    </div>
  );
}

/** One-line version for the quick-comparison grid at the top of /programs. */
export function CycleCountdownCompact({ programId }: { programId: string }) {
  const { now, cycle, rolling } = useCycle(programId);

  if (rolling) {
    return (
      <div className="flex justify-between">
        <span className="text-ink-soft">Next cycle</span>
        <span className="text-ink-mid">Rolling</span>
      </div>
    );
  }

  if (!PROGRAM_SCHEDULES[programId]) return null;

  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-ink-soft">{cycle?.isOpen ? 'Closes in' : 'Opens in'}</span>
      {cycle ? (
        <Digits target={cycle.isOpen ? cycle.closesAt : cycle.opensAt} now={now} size="sm" />
      ) : (
        <Placeholder size="sm" />
      )}
    </div>
  );
}

/**
 * Hero banner naming whichever program is open now, or opens soonest, so an
 * applicant landing on the page sees the one deadline that matters today.
 */
export function NextCycleHighlight({
  programs,
}: {
  programs: { id: string; short: string }[];
}) {
  const now = useNow();

  if (now === 0) {
    return <div className="h-[46px]" aria-hidden="true" />;
  }

  const resolved = programs
    .map((p) => {
      const schedule = PROGRAM_SCHEDULES[p.id];
      const cycle = schedule ? resolveNextCycle(schedule, now) : null;
      return cycle ? { ...p, cycle } : null;
    })
    .filter((p): p is typeof p & { cycle: NextCycle } => p !== null);

  const openNow = resolved
    .filter((p) => p.cycle.isOpen)
    .sort((a, b) => a.cycle.closesAt - b.cycle.closesAt);

  const soonest = resolved
    .filter((p) => !p.cycle.isOpen)
    .sort((a, b) => a.cycle.opensAt - b.cycle.opensAt)[0];

  const featured = openNow[0] ?? soonest;
  if (!featured) return null;

  const open = featured.cycle.isOpen;
  const others = open ? openNow.length - 1 : 0;

  return (
    <a
      href={`#${featured.id}`}
      className="inline-flex items-center gap-3 rounded-full border border-line bg-ground px-4 py-2.5 shadow-card card-hover"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${open ? 'bg-success-500 animate-pulse' : 'bg-brand-500'}`}
      />
      <span className="text-ink-mid text-xs">
        {open ? (
          <>
            <span className="font-[650] text-ink">{featured.short}</span> is accepting applications
            {others > 0 && <span className="text-ink-soft"> (+{others} more)</span>} — closes in
          </>
        ) : (
          <>
            Next cycle to open: <span className="font-[650] text-ink">{featured.short}</span> in
          </>
        )}
      </span>
      <Digits target={open ? featured.cycle.closesAt : featured.cycle.opensAt} now={now} size="sm" />
    </a>
  );
}
