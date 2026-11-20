'use client';

import { useMemo, useState } from 'react';
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
const CELL = 13;
const GAP = 3;

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
export function MaintainerHeatmap({ activity }: { activity: MaintainerActivity }) {
  const heat = useMemo(
    () => buildHeatmap(activity.events, new Date(activity.since), new Date(activity.until)),
    [activity],
  );
  const [hover, setHover] = useState<{ day: HeatDay; x: number; y: number } | null>(null);

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
        <div className="relative overflow-x-auto pb-1 flex-1 min-w-0" onPointerLeave={() => setHover(null)}>
          <div className="flex gap-2 w-max ml-auto">
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
                        <div
                          key={di}
                          title={day ? `${day.date}: ${count} ${count === 1 ? 'event' : 'events'}` : undefined}
                          onPointerEnter={(e) => {
                            if (!day) return;
                            const host = e.currentTarget.offsetParent as HTMLElement | null;
                            const r = e.currentTarget.getBoundingClientRect();
                            const hr = host?.getBoundingClientRect();
                            setHover({ day, x: r.left - (hr?.left ?? 0) + r.width / 2 + (host?.scrollLeft ?? 0), y: r.bottom - (hr?.top ?? 0) + 6 });
                          }}
                          className={`rounded-[3px] ${day ? '' : 'opacity-0'} ${day && hover?.day.date === day.date ? 'ring-2 ring-success-600 ring-offset-1 ring-offset-ground' : ''}`}
                          style={{ width: CELL, height: CELL, marginTop: di === 5 ? 4 : 0, backgroundColor: day ? LEVEL_BG[level] : 'transparent', border: level === 0 && day ? '1px solid var(--color-line)' : undefined }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {hover && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-line bg-ground/95 backdrop-blur px-3 py-2.5 shadow-pop text-[12px] w-[260px]"
              style={{ left: `clamp(130px, ${hover.x}px, calc(100% - 130px))`, top: hover.y }}
            >
              <div className="font-[650] text-ink">{longDate(hover.day.date)}</div>
              <div className="text-ink-mid mb-1.5 tabular-nums">
                {hover.day.merged + hover.day.raised === 0
                  ? 'No maintainer activity'
                  : `${hover.day.merged} merged · ${hover.day.raised} raised`}
              </div>
              {hover.day.people.slice(0, 5).map((p) => (
                <div key={p.login} className="mb-1.5 last:mb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-[600] text-ink truncate">@{p.login}</span>
                    <span className="text-ink-soft tabular-nums shrink-0">
                      {p.merged > 0 && `${p.merged} merged`}{p.merged > 0 && p.raised > 0 && ' · '}{p.raised > 0 && `${p.raised} raised`}
                    </span>
                  </div>
                  {p.prs.slice(0, 3).map((pr) => (
                    <div key={`${pr.kind}-${pr.n}`} className="text-ink-soft truncate leading-5">
                      <span className="text-ink-faint">#{pr.n}</span> {pr.title} <span className="text-ink-faint">· {pr.kind}</span>
                    </div>
                  ))}
                  {p.prs.length > 3 && <div className="text-ink-faint leading-5">and {p.prs.length - 3} more</div>}
                </div>
              ))}
              {hover.day.people.length > 5 && <div className="text-ink-faint">and {hover.day.people.length - 5} more maintainers</div>}
            </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
