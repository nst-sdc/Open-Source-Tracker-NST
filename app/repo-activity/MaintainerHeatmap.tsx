'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildHeatmap, heatLevel, WEEKDAY_LONG, WEEKDAY_SHORT, type HeatDay, type MaintainerEvent } from '@/lib/maintainer-heatmap';

export interface MaintainerActivity {
  events: MaintainerEvent[];
  since: string;
  until: string;
  mergesKnown: boolean;
}

const LEVEL_BG = [
  'var(--color-panel-2)',
  'var(--color-success-100)',
  'var(--color-success-200)',
  'var(--color-success-400)',
  'var(--color-success-600)',
];
const GAP = 3;
/** Bigger squares when the window is short: a month is five columns, not fifty-three. */
const cellSize = (weeks: number) => (weeks <= 6 ? 24 : weeks <= 14 ? 18 : 13);

const longDate = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const monthShort = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short' });
const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * A GitHub-style calendar of the days maintainers merged or raised pull
 * requests: columns are weeks, rows run Monday to Sunday so weekends sit at
 * the bottom, darker green is a busier day. Hovering a day names who was
 * active and on which PRs. Days are the viewer's own calendar days.
 */
export function MaintainerHeatmap({ activity, repoUrl }: { activity: MaintainerActivity; repoUrl: string }) {
  const heat = useMemo(
    () => buildHeatmap(activity.events, new Date(activity.since), new Date(activity.until)),
    [activity],
  );
  // The day card is portalled to <body> at fixed coordinates next to the
  // square (inside the scrolling grid it was clipped and sat under the
  // cards). It opens on hover and stays while the pointer is on the square
  // or on the card itself, so every PR in it can be clicked; a click on the
  // square pins it until Close, Escape, or a click elsewhere.
  const [card, setCard] = useState<{ day: HeatDay; x: number; y: number; above: boolean } | null>(null);
  const [pinned, setPinned] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setCard(null), 180);
  };
  const placeFor = (el: HTMLElement, day: HeatDay) => {
    const r = el.getBoundingClientRect();
    const above = r.bottom + 360 > window.innerHeight && r.top > 360;
    return { day, x: r.left + r.width / 2, y: above ? r.top - 6 : r.bottom + 6, above };
  };
  useEffect(() => {
    if (!card) return;
    const onScroll = (e: Event) => {
      if (cardRef.current && e.target instanceof Node && cardRef.current.contains(e.target)) return; // scrolling the list itself
      setCard(null); setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCard(null); setPinned(false); } };
    const onDown = (e: PointerEvent) => {
      if (!pinned) return;
      if (cardRef.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest?.('[data-heat-cell]')) return;
      setCard(null); setPinned(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [card, pinned]);
  useEffect(() => cancelClose, []);

  const CELL = cellSize(heat.weeks.length);
  const weekdayMax = Math.max(1, ...heat.weekdayTotals);
  const gridW = heat.weeks.length * (CELL + GAP) - GAP;
  const monthMarks = heat.weeks.map((week, i) => {
    const firstDay = week.find((d) => d !== null);
    if (!firstDay) return null;
    const prev = i > 0 ? heat.weeks[i - 1].find((d) => d !== null) : null;
    const m = firstDay.date.slice(0, 7);
    return !prev || prev.date.slice(0, 7) !== m ? monthShort(firstDay.date) : null;
  });

  const summary = (() => {
    if (heat.total === 0) return activity.mergesKnown ? 'No maintainer merged or raised a pull request in this period.' : 'No pull request raised by a maintainer in this period.';
    const busy = list(heat.busiest.map((i) => WEEKDAY_LONG[i]));
    const weekend = Math.round(heat.weekendShare * 100);
    const when = weekend === 0 ? 'nothing at weekends' : weekend < 15 ? `only ${weekend}% at weekends` : `${weekend}% at weekends`;
    return `Busiest on ${busy}${heat.busiest.length > 1 ? 's' : ''}; ${when}. ${heat.people} maintainer${heat.people === 1 ? '' : 's'} active.`;
  })();

  return (
    <div className="bg-ground border border-line rounded-2xl p-5 mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-ink text-sm font-[650]">When maintainers are active</h3>
        <p className="text-ink-soft text-xs">days in your time zone{activity.mergesKnown ? '' : ' · merges unknown without a GitHub token'}</p>
      </div>
      <p className="text-ink-mid text-xs mt-1 mb-4">
        {summary} Each square is a day a maintainer merged or raised a pull request; darker means more. Plan your pings for the greener days.
      </p>

      <div className="flex gap-5 flex-col lg:flex-row lg:items-start">
        {/* Calendar */}
        <div className="relative overflow-x-auto pb-1 flex-1 min-w-0">
          <div className="flex gap-2 w-max">
            <div className="flex flex-col text-[10px] text-ink-soft tabular-nums shrink-0" style={{ paddingTop: 16 }}>
              {WEEKDAY_SHORT.map((d, i) => (
                <div key={d} className={`leading-none ${i >= 5 ? 'text-ink-faint' : ''}`} style={{ height: CELL, marginBottom: i === 6 ? 0 : GAP, marginTop: i === 5 ? 4 : 0, lineHeight: `${CELL}px` }}>{d}</div>
              ))}
            </div>
            <div>
              <div className="relative text-[10px] text-ink-soft" style={{ height: 12, width: gridW, marginBottom: 4 }}>
                {monthMarks.map((m, i) => m && <span key={i} className="absolute" style={{ left: i * (CELL + GAP) }}>{m}</span>)}
              </div>
              <div className="flex" style={{ gap: GAP }} role="img" aria-label={summary}>
                {heat.weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                    {week.map((day, di) => {
                      const count = day ? day.merged + day.raised : 0;
                      const level = heatLevel(count, heat.maxDay);
                      return (
                        <button
                          type="button"
                          key={di}
                          data-heat-cell
                          tabIndex={day ? 0 : -1}
                          aria-label={day ? `${day.date}: ${count} ${count === 1 ? 'event' : 'events'}` : undefined}
                          aria-pressed={!!day && pinned && card?.day.date === day.date}
                          onClick={(e) => {
                            if (!day) return;
                            cancelClose();
                            if (pinned && card?.day.date === day.date) { setPinned(false); setCard(null); return; }
                            setCard(placeFor(e.currentTarget, day));
                            setPinned(true);
                          }}
                          onPointerEnter={(e) => {
                            if (!day || pinned) return;
                            cancelClose();
                            setCard(placeFor(e.currentTarget, day));
                          }}
                          onPointerLeave={scheduleClose}
                          onFocus={(e) => { if (day && !pinned) setCard(placeFor(e.currentTarget, day)); }}
                          className={`rounded-[3px] p-0 block ${day ? 'cursor-pointer' : 'opacity-0 pointer-events-none'} ${day && card?.day.date === day.date ? 'ring-2 ring-success-600 ring-offset-1 ring-offset-ground' : ''}`}
                          style={{ width: CELL, height: CELL, marginTop: di === 5 ? 4 : 0, backgroundColor: day ? LEVEL_BG[level] : 'transparent', border: level === 0 && day ? '1px solid var(--color-line)' : undefined }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* card is only ever set by a pointer or focus event, so this never renders on the server */}
          {card && typeof document !== 'undefined' && createPortal(
            <div
              ref={cardRef}
              role="dialog"
              aria-label={`Maintainer activity on ${longDate(card.day.date)}`}
              onPointerEnter={cancelClose}
              onPointerLeave={scheduleClose}
              className={`fixed z-[70] -translate-x-1/2 ${card.above ? '-translate-y-full' : ''} rounded-xl border border-line bg-ground/95 backdrop-blur shadow-pop text-[12px] w-[360px] max-w-[calc(100vw-24px)] flex flex-col`}
              style={{ left: `clamp(192px, ${card.x}px, calc(100vw - 192px))`, top: card.y, maxHeight: 'min(60vh, 480px)' }}
            >
              <div className="flex items-start justify-between gap-3 px-3.5 pt-3 pb-2 border-b border-line shrink-0">
                <div>
                  <div className="font-[650] text-ink">{longDate(card.day.date)}</div>
                  <div className="text-ink-mid tabular-nums">
                    {card.day.merged + card.day.raised === 0
                      ? 'No maintainer activity'
                      : `${card.day.merged} merged · ${card.day.raised} raised · ${card.day.people.length} maintainer${card.day.people.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                {pinned ? (
                  <button type="button" onClick={() => { setPinned(false); setCard(null); }} className="text-ink-soft hover:text-ink text-[11px] font-[550] px-2 py-0.5 rounded-md border border-line bg-ground cursor-pointer shrink-0">Close</button>
                ) : (
                  <span className="text-[10px] text-ink-faint shrink-0 text-right leading-tight">click the square<br />to keep this open</span>
                )}
              </div>
              <div className="overflow-y-auto overscroll-contain px-3.5 py-2 scrollbar-thin" data-lenis-prevent>
                {card.day.people.map((p) => (
                  <div key={p.login} className="py-1.5 border-b border-line last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <a href={`https://github.com/${p.login}`} target="_blank" rel="noopener noreferrer" className="font-[600] text-ink hover:text-violet-600 truncate">@{p.login}</a>
                      <span className="text-ink-soft tabular-nums shrink-0">
                        {p.merged > 0 && `${p.merged} merged`}{p.merged > 0 && p.raised > 0 && ' · '}{p.raised > 0 && `${p.raised} raised`}
                      </span>
                    </div>
                    {p.prs.map((pr) => (
                      <a
                        key={`${pr.kind}-${pr.n}`}
                        href={`${repoUrl}/pull/${pr.n}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${pr.title}${pr.by ? ` · by @${pr.by}` : ''}`}
                        className="flex items-start gap-1.5 leading-5 rounded-md px-1.5 -mx-1.5 text-ink-soft hover:bg-panel-2 hover:text-ink transition-colors"
                      >
                        <span className={`shrink-0 font-[600] ${pr.kind === 'merged' ? 'text-success-600' : 'text-violet-600'}`}>{pr.kind}</span>
                        <span className="min-w-0 truncate"><span className="text-ink-faint">#{pr.n}</span> {pr.title}{pr.by && <span className="text-ink-faint"> · by @{pr.by}</span>}</span>
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )}
        </div>

        {/* Weekday pattern */}
        <div className="shrink-0 lg:w-[220px]">
          <div className="text-[11px] font-[600] text-ink-mid mb-2">By weekday</div>
          {WEEKDAY_SHORT.map((d, i) => (
            <div key={d} className={`flex items-center gap-2 text-[11px] tabular-nums ${i === 5 ? 'mt-2 pt-2 border-t border-line' : 'mt-1'}`}>
              <span className={`w-7 ${i >= 5 ? 'text-ink-faint' : 'text-ink-soft'}`}>{d}</span>
              <div className="flex-1 h-2 rounded-full bg-panel-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(heat.weekdayTotals[i] / weekdayMax) * 100}%`, backgroundColor: heat.busiest.includes(i) ? 'var(--color-success-600)' : 'var(--color-success-400)' }} />
              </div>
              <span className="w-7 text-right text-ink font-[600]">{heat.weekdayTotals[i]}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 mt-4 text-[10px] text-ink-faint">
            less
            {LEVEL_BG.map((bg, i) => <span key={i} className="inline-block rounded-[3px]" style={{ width: 11, height: 11, backgroundColor: bg, border: i === 0 ? '1px solid var(--color-line)' : undefined }} />)}
            more
            <span className="ml-2">· hover a square for the day, click to keep it open</span>
          </div>
        </div>
      </div>

    </div>
  );
}
