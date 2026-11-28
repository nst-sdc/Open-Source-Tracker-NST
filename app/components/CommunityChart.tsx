'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import type { MonthBucket, ChartRanges } from '@/lib/community-timeline';
import { averagesOf } from '@/lib/timeline-averages';
import { impactOutOf10, prValueOutOf10, outOf10 } from '@/lib/display-scale';
import { PROutcomeCapsule } from './PROutcomeCapsule';

/**
 * The community's activity by month: four thin lines (merged, opened, and
 * closed-without-merge pull requests on the left axis; issues opened on the
 * right axis, because issue volume runs several times PR volume and would
 * flatten the rest), a soft area under merged, and a hover crosshair with a
 * card that reads out every series for the month under the pointer. Legend
 * entries toggle their series. `compact` is the home-page version.
 */
type SeriesKey = 'merged' | 'opened' | 'closed' | 'issues';

const SERIES: Array<{ key: SeriesKey; label: string; color: string; axis: 'left' | 'right'; width: number }> = [
  { key: 'merged', label: 'Merged PRs', color: 'var(--color-success-500)', axis: 'left', width: 2.25 },
  { key: 'opened', label: 'PRs opened', color: 'var(--color-brand-500)', axis: 'left', width: 1.5 },
  { key: 'closed', label: 'Closed unmerged', color: 'var(--color-warning-600)', axis: 'left', width: 1.5 },
  { key: 'issues', label: 'Issues opened', color: 'var(--color-violet-500)', axis: 'right', width: 1.5 },
];

const monthLabel = (m: string, long = false) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' });

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * pow >= v) return k * pow;
  return v;
}

/** Monotone cubic path through the points, so the line never overshoots a value. */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const dy = pts.slice(1).map((p, i) => p[1] - pts[i][1]);
  const m = dx.map((d, i) => dy[i] / d);
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      t[i] = (3 * a) / h * m[i];
      t[i + 1] = (3 * b) / h * m[i];
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    d += ` C${(pts[i][0] + h / 3).toFixed(1)},${(pts[i][1] + (t[i] * h) / 3).toFixed(1)} ${(pts[i + 1][0] - h / 3).toFixed(1)},${(pts[i + 1][1] - (t[i + 1] * h) / 3).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

export function CommunityChart({
  series: seriesProp,
  ranges,
  compact = false,
  scopeLabel,
  href = '/contributors',
}: {
  /** The months to draw. Used when `ranges` is not given (the home sparkline). */
  series?: MonthBucket[];
  /** Full chart: last-12-months plus one calendar year per chip, GitHub-style. */
  ranges?: ChartRanges;
  compact?: boolean;
  /** e.g. "ADYPU · 2nd year" when the contributors page is filtered. */
  scopeLabel?: string;
  href?: string;
}) {
  const gradId = useId().replace(/:/g, '');
  const [range, setRange] = useState<'recent' | number>('recent');
  const series: MonthBucket[] = useMemo(
    () => (ranges ? (range === 'recent' ? ranges.recent : (ranges.years.find((y) => y.year === range)?.series ?? ranges.recent)) : (seriesProp ?? [])),
    [ranges, range, seriesProp],
  );
  const [hover, setHover] = useState<number | null>(null);
  // True while the pointer is on the merged line itself (not just inside the
  // chart); that is what reveals the supporting series.
  const [onLine, setOnLine] = useState(false);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(() => new Set());
  const visible = SERIES.filter((s) => !hidden.has(s.key));

  const totals = useMemo(
    () =>
      series.reduce(
        (a, b) => ({ opened: a.opened + b.opened, merged: a.merged + b.merged, closed: a.closed + b.closed, issues: a.issues + b.issues }),
        { opened: 0, merged: 0, closed: 0, issues: 0 },
      ),
    [series],
  );
  // Project impact and effort per merged PR over the months in view, out of
  // 10 like the badges on a profile (lib/display-scale).
  const quality = useMemo(() => averagesOf(series), [series]);
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const span = series.length ? `${monthLabel(series[0].month, true)} – ${monthLabel(last.month, true)}` : '';

  // ── Geometry ──────────────────────────────────────────────────────────────
  const width = 720;
  const height = compact ? 88 : 240;
  const padLeft = compact ? 0 : 40;
  const padRight = compact ? 0 : 44;
  const padTop = compact ? 6 : 12;
  const padBottom = compact ? 2 : 40;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const baseline = padTop + plotH;
  const n = Math.max(1, series.length);
  const xFor = (i: number) => padLeft + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  // Compact (home) draws merged only and stretches the scale to the range the
  // data actually occupies, so month-to-month movement is visible instead of
  // a flat line pinned near zero. The full chart keeps a zero baseline.
  const mergedVals = series.map((b) => b.merged);
  // The full chart lifts its floor a little too (half of the lowest visible
  // left-axis value), enough to open up the month-to-month movement while
  // keeping the axis honest; the ticks label the real values.
  const leftVisibleMin = Math.min(
    ...series.flatMap((b) => [hidden.has('merged') ? Infinity : b.merged, hidden.has('opened') ? Infinity : b.opened, hidden.has('closed') ? Infinity : b.closed]),
  );
  const leftMin = compact
    ? Math.max(0, Math.floor(Math.min(...mergedVals) * 0.85))
    : Number.isFinite(leftVisibleMin) ? Math.max(0, Math.floor(leftVisibleMin * 0.5)) : 0;
  const leftMax = compact
    ? Math.max(leftMin + 1, Math.ceil(Math.max(...mergedVals) * 1.05))
    : niceCeil(Math.max(0, ...series.flatMap((b) => [hidden.has('merged') ? 0 : b.merged, hidden.has('opened') ? 0 : b.opened, hidden.has('closed') ? 0 : b.closed])));
  const rightMax = niceCeil(Math.max(0, ...series.map((b) => (hidden.has('issues') ? 0 : b.issues))));
  const yLeft = (v: number) => baseline - ((v - leftMin) / (leftMax - leftMin)) * plotH;
  const yRight = (v: number) => baseline - (v / rightMax) * plotH;
  const yFor = (key: SeriesKey, v: number) => (key === 'issues' ? yRight(v) : yLeft(v));
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  if (totals.opened === 0 && totals.merged === 0 && totals.issues === 0) {
    if (compact) return null;
    return (
      <div className="bg-ground border border-line rounded-2xl shadow-card p-5">
        <h2 className="text-ink text-sm font-[650]">Community activity</h2>
        <p className="text-ink-soft text-[13px] mt-2">No activity recorded yet{scopeLabel ? ` for ${scopeLabel}` : ''}. The chart fills in after the next refresh.</p>
      </div>
    );
  }

  // Merged is drawn as points joined by straight segments, so each month's
  // value is a visible dot and the line reads as data, not a trend; the
  // supporting series are smoothed so they sit back visually.
  const straightPath = (pts: Array<[number, number]>) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const pointsFor = (key: SeriesKey) => series.map((b, i) => [xFor(i), yFor(key, b[key])] as [number, number]);
  const paths = (compact ? visible.filter((s) => s.key === 'merged') : visible).map((s) => ({
    ...s,
    d: s.key === 'merged' ? straightPath(pointsFor('merged')) : smoothPath(pointsFor(s.key)),
  }));
  const mergedArea = !hidden.has('merged')
    ? `${straightPath(pointsFor('merged'))} L${xFor(n - 1).toFixed(1)},${baseline} L${xFor(0).toFixed(1)},${baseline} Z`
    : '';

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xFor(i) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  // The crosshair and the stat card, like the supporting series, appear only
  // while the pointer (or keyboard focus) is on the merged line.
  const hovered = onLine && hover !== null ? series[hover] : null;
  const tipLeftPct = hover !== null ? (xFor(hover) / width) * 100 : 0;

  const svg = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full overflow-visible touch-none select-none"
      role="img"
      aria-label={`Community activity by month${scopeLabel ? ` for ${scopeLabel}` : ''}: ${totals.merged} pull requests merged, ${totals.opened} opened, ${totals.closed} closed without merging and ${totals.issues} issues opened across ${series.length} months.`}
      onPointerMove={onMove}
      onPointerLeave={() => { setHover(null); setOnLine(false); }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-success-500)" stopOpacity={compact ? 0.35 : 0.22} />
          <stop offset="100%" stopColor="var(--color-success-500)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {!compact &&
        ticks.map((t) => (
          <g key={t}>
            <line x1={padLeft} y1={baseline - t * plotH} x2={width - padRight} y2={baseline - t * plotH} stroke={t === 0 ? 'var(--color-line-strong)' : 'var(--color-line)'} strokeWidth="1" strokeDasharray={t === 0 ? undefined : '2 4'} />
            <text x={padLeft - 8} y={baseline - t * plotH + 3.5} textAnchor="end" fontSize="10" fill="var(--color-ink-faint)" className="tabular-nums">{Math.round(leftMin + t * (leftMax - leftMin))}</text>
            {!hidden.has('issues') && (
              <text x={width - padRight + 8} y={baseline - t * plotH + 3.5} textAnchor="start" fontSize="10" fill="var(--color-violet-500)" className="tabular-nums" opacity="0.8">{Math.round(t * rightMax)}</text>
            )}
          </g>
        ))}

      {/* Slight vertical grid, one line per month */}
      {!compact && series.map((b, i) => (
        <line key={`g${b.month}`} x1={xFor(i)} y1={padTop} x2={xFor(i)} y2={baseline} stroke="var(--color-line)" strokeWidth="1" opacity="0.6" />
      ))}

      {/* Running month shading */}
      {!compact && last?.partial && n > 1 && (
        <rect x={(xFor(n - 2) + xFor(n - 1)) / 2} y={padTop} width={xFor(n - 1) - (xFor(n - 2) + xFor(n - 1)) / 2 + 2} height={plotH} fill="var(--color-panel)" opacity="0.7" />
      )}

      {mergedArea && <path d={mergedArea} fill={`url(#${gradId})`} />}

      {/* Merged is the headline and always drawn in full; the other series
          are invisible until the pointer rests on the merged line itself,
          then appear at a quarter opacity so merged still leads. The
          legend keeps their totals visible at all times. */}
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={p.color}
          strokeWidth={p.key === 'merged' ? (compact ? 2 : 2.5) : p.width}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={p.key === 'issues' ? '5 4' : undefined}
          opacity={p.key === 'merged' ? 1 : onLine ? 0.25 : 0}
          style={{ transition: 'opacity 180ms ease' }}
        />
      ))}

      {!hidden.has('merged') && series.map((b, i) => (
        <circle key={`m${b.month}`} cx={xFor(i)} cy={yLeft(b.merged)} r={compact ? 2 : 3.5} fill="var(--color-ground)" stroke="var(--color-success-500)" strokeWidth={compact ? 1.5 : 2} />
      ))}

      {!compact && (
        <>
          {series.map((b, i) => (
            <text key={b.month} x={xFor(i)} y={baseline + 16} textAnchor="middle" fontSize="10.5" fill={hovered && hover === i ? 'var(--color-ink)' : 'var(--color-ink-soft)'} fontWeight={hovered && hover === i ? 650 : 450}>
              {monthLabel(b.month)}
            </text>
          ))}
          {series.map((b, i) => (
            <text key={`c${b.month}`} x={xFor(i)} y={baseline + 30} textAnchor="middle" fontSize="9.5" fill="var(--color-ink-faint)" className="tabular-nums">
              {b.contributors || '·'}
            </text>
          ))}
        </>
      )}

      {/* Crosshair + points for the hovered month */}
      {hovered && hover !== null && (
        <g>
          <line x1={xFor(hover)} y1={padTop} x2={xFor(hover)} y2={baseline} stroke="var(--color-ink-faint)" strokeWidth="1" strokeDasharray="3 3" />
          {visible.map((s) => (
            <circle key={s.key} cx={xFor(hover)} cy={yFor(s.key, hovered[s.key])} r={s.key === 'merged' ? (compact ? 3.5 : 5) : compact ? 3 : 4} fill="var(--color-ground)" stroke={s.color} strokeWidth={s.key === 'merged' ? 2.5 : 2} />
          ))}
        </g>
      )}

      {/* Invisible hit strips so touch and keyboard users can land on a month */}
      {series.map((b, i) => (
        <rect key={`hit${b.month}`} x={i === 0 ? padLeft : (xFor(i - 1) + xFor(i)) / 2} y={0} width={i === 0 ? (xFor(1) ?? xFor(0)) / 2 - padLeft + (n === 1 ? plotW : 0) : (xFor(Math.min(n - 1, i + 1)) - xFor(i - 1)) / 2} height={height} fill="transparent" onPointerEnter={() => setHover(i)} onFocus={() => { setHover(i); setOnLine(true); }} onBlur={() => setOnLine(false)} tabIndex={compact ? -1 : 0} aria-label={`${monthLabel(b.month, true)}: ${b.merged} merged, ${b.opened} opened, ${b.closed} closed unmerged, ${b.issues} issues, ${b.contributors} students with a merge, ${b.active ?? 0} students active`} />
      ))}
      {/* Wide, invisible stroke over the merged line: the hover target that
          reveals the other series. Drawn above the month hit strips so it
          wins the pointer. */}
      {!hidden.has('merged') && (
        <path
          d={straightPath(pointsFor('merged'))}
          fill="none"
          stroke="transparent"
          strokeWidth={compact ? 14 : 22}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
          onPointerEnter={() => setOnLine(true)}
          onPointerLeave={() => setOnLine(false)}
        />
      )}
    </svg>
  );

  const tooltip = hovered && (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-line bg-ground/95 backdrop-blur px-3 py-2.5 shadow-pop text-[12px] min-w-[224px]"
      style={{ left: `clamp(100px, ${tipLeftPct}%, calc(100% - 100px))` }}
    >
      <div className="font-[650] text-ink mb-1.5">
        {monthLabel(hovered.month, true)}
        {hovered.partial && <span className="ml-1.5 text-[10.5px] font-[550] text-ink-soft">so far</span>}
      </div>
      {SERIES.map((s) => (
        <div key={s.key} className={`flex items-center justify-between gap-4 leading-6 ${hidden.has(s.key) ? 'opacity-40' : ''}`}>
          <span className="inline-flex items-center gap-1.5 text-ink-mid">
            <span className="w-2.5 h-[3px] rounded" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
          <span className="tabular-nums font-[600] text-ink">{hovered[s.key].toLocaleString('en-IN')}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 leading-6 border-t border-line mt-1 pt-1 text-ink-mid">
        <span>Students with a merge</span>
        <span className="tabular-nums font-[600] text-ink">{hovered.contributors.toLocaleString('en-IN')}</span>
      </div>
      <div className="flex items-center justify-between gap-4 leading-6 text-ink-mid" title="Students with any PR opened, merged or closed, or any issue opened, this month">
        <span>Students active</span>
        <span className="tabular-nums font-[600] text-ink">{(hovered.active ?? 0).toLocaleString('en-IN')}</span>
      </div>
      {(hovered.avgImpact !== null || hovered.avgEffort !== null) && (
        <div className="border-t border-line mt-1 pt-1">
          <div className="flex items-center justify-between gap-4 leading-6 text-ink-mid" title="Average project impact of the PRs merged this month: the repo multiplier M, out of 10">
            <span>Avg impact <span className="text-ink-faint">/10</span></span>
            <span className="tabular-nums font-[600] text-ink">{hovered.avgImpact === null ? '—' : outOf10(impactOutOf10(hovered.avgImpact))}</span>
          </div>
          <div className="flex items-center justify-between gap-4 leading-6 text-ink-mid" title="Average effort of the measured PRs merged this month: the change itself, out of 10; a typical twenty-line code change is a 5">
            <span>Avg effort <span className="text-ink-faint">/10</span></span>
            <span className="tabular-nums font-[600] text-ink">{hovered.avgEffort === null ? '—' : outOf10(prValueOutOf10(hovered.avgEffort))}</span>
          </div>
        </div>
      )}
      {(hovered.openedMerged ?? 0) + (hovered.openedClosed ?? 0) + (hovered.openedStillOpen ?? 0) > 0 && (
        <div className="border-t border-line mt-1 pt-1.5">
          <div className="text-[11px] text-ink-soft">PRs opened this month</div>
          <PROutcomeCapsule merged={hovered.openedMerged ?? 0} open={hovered.openedStillOpen ?? 0} closed={hovered.openedClosed ?? 0} />
        </div>
      )}
    </div>
  );

  if (compact) {
    const delta = last && prev ? last.merged - prev.merged : 0;
    return (
      <div className="bg-ground border border-line rounded-2xl shadow-card p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11.5px] font-[650] uppercase tracking-wider text-ink-soft">Merged PRs per month</div>
            <div className="mt-1 text-[22px] leading-none font-[650] tabular-nums text-success-600">
              {(hovered ?? last)?.merged.toLocaleString('en-IN') ?? 0}
              <span className="ml-2 text-[12px] font-[550] text-ink-soft">{hovered ? monthLabel(hovered.month, true) : 'this month so far'}</span>
            </div>
          </div>
          <div className="text-right text-[12px] text-ink-soft">
            <div className="tabular-nums">{prev?.merged.toLocaleString('en-IN') ?? 0} last month</div>
            {prev && <div className={delta >= 0 ? 'text-success-600' : 'text-ink-soft'}>{delta >= 0 ? '+' : ''}{delta} vs last month</div>}
          </div>
        </div>
        <div className="relative mt-3">{svg}{tooltip}</div>
        <Link href={href} className="mt-2 inline-block text-[12px] font-[550] text-brand-600 hover:text-brand-500">See the full community chart →</Link>
      </div>
    );
  }

  return (
    <div className="bg-ground border border-line rounded-2xl shadow-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-ink text-sm font-[650]">
          Community activity{scopeLabel ? <span className="text-ink-soft font-[500]"> · {scopeLabel}</span> : ''}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {ranges && (
            <div className="flex items-center gap-1 rounded-full border border-line bg-panel p-0.5" role="tablist" aria-label="Range">
              {[{ key: 'recent' as const, label: 'Last 12 months' }, ...ranges.years.map((y) => ({ key: y.year, label: String(y.year) }))].map((r) => (
                <button
                  key={String(r.key)}
                  type="button"
                  role="tab"
                  aria-selected={range === r.key}
                  onClick={() => { setRange(r.key); setHover(null); setOnLine(false); }}
                  className={`px-2.5 py-1 rounded-full text-[11.5px] font-[550] transition-colors ${range === r.key ? 'bg-ground text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-ink-soft text-xs">By month <span className="text-ink-faint">· {span}</span></p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2.5 mb-1">
        {SERIES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={!off}
              onClick={() => setHidden((h) => {
                const next = new Set(h);
                if (next.has(s.key)) next.delete(s.key);
                else if (next.size < SERIES.length - 1) next.add(s.key);
                return next;
              })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${off ? 'border-line text-ink-faint line-through' : 'border-line bg-panel text-ink-mid hover:border-line-strong'}`}
              title={off ? `Show ${s.label}` : `Hide ${s.label}`}
            >
              <span className="w-3 h-[3px] rounded" style={{ backgroundColor: s.color, opacity: off ? 0.4 : 1 }} />
              {s.label}
              <span className="tabular-nums text-ink-soft">{totals[s.key].toLocaleString('en-IN')}</span>
            </button>
          );
        })}
        {quality.impact !== null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink-mid" title={`Average project impact per merged PR over ${span}: the repo multiplier M, out of 10`}>
            Impact <span className="tabular-nums font-[600] text-ink">{outOf10(impactOutOf10(quality.impact))}</span><span className="text-ink-faint">/10 avg</span>
          </span>
        )}
        {quality.effort !== null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink-mid" title={`Average effort per measured merged PR over ${span}: what the change itself did, out of 10; a typical twenty-line code change is a 5`}>
            Effort <span className="tabular-nums font-[600] text-ink">{outOf10(prValueOutOf10(quality.effort))}</span><span className="text-ink-faint">/10 avg</span>
          </span>
        )}
        <span className="text-[11px] text-ink-faint ml-auto">hover the merged line to reveal opened, closed and issues · issues on the right axis · numbers under the months: students with a merge</span>
      </div>
      <div className="relative">
        {svg}
        {tooltip}
      </div>
    </div>
  );
}
