import type { StudentPR } from '@/lib/github';

/**
 * The time window a `?period=` filter selects, or null for "everything".
 * The stat cards, the pull-request list and the chart all read the window from
 * here, so a filtered page can never show one range in the numbers and a
 * different one in the chart.
 */
export function periodRange(period?: string, from?: string, to?: string): { min: number; max: number } | null {
  if (!period || period === 'all') return null;

  const daysAgo = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

  let min = 0;
  let max = Infinity;

  switch (period) {
    case '1day':    min = daysAgo(1); break;
    case 'week':    min = daysAgo(7); break;
    case 'month':   min = daysAgo(30); break;
    case '2months': min = daysAgo(60); break;
    case '3months': min = daysAgo(90); break;
    case '6months': min = daysAgo(180); break;
    case 'year':    min = daysAgo(365); break;
    case 'custom':
      if (from) min = new Date(from).getTime();
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        max = toDate.getTime();
      }
      break;
    default:
      return null;
  }

  if (!Number.isFinite(min)) min = 0;
  return { min, max };
}

// ─── Contribution chart ──────────────────────────────────────────────────────
//
// One bar per time bucket, split into the same three states the tabs above use:
// merged, still open, and closed without being merged. The bar's full height is
// the number of pull requests opened in that bucket, so it always agrees with
// the "Total PRs" card. The bucket size follows the selected date range — days
// for a short range, weeks for a few months, months for a year — because a
// monthly bar chart of "the last 7 days" tells the reader nothing.

const SERIES = [
  { key: 'merged', label: 'Merged', color: '#009965' },
  { key: 'open',   label: 'Open',   color: '#0673f9' },
  { key: 'closed', label: 'Closed', color: '#d22d3a' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

interface Bucket {
  start: number;
  end: number;
  label: string;
  full: string;
  counts: Record<SeriesKey, number>;
  total: number;
  /** The bucket runs past right now, so its bar counts a part-finished period. */
  partial: boolean;
}

/**
 * Rounds an axis top up to the nearest readable number that is also divisible
 * by two, so the halfway gridline gets a whole-number label as well.
 */
function niceMax(value: number): number {
  if (value <= 4) return Math.max(2, Math.ceil(value / 2) * 2);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.2, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value && Number.isInteger(candidate / 2)) return candidate;
  }
  return 10 * magnitude;
}

/**
 * Absolute ceiling on how many bars any view will draw. This is a guard against
 * a hand-edited `?from=1970`, not a display choice — the chart scrolls
 * horizontally rather than dropping history, so a contributor's whole record
 * stays on the chart however long it is.
 */
const MAX_BUCKETS = 120;

/** Narrowest a bar's slot may get before the chart starts scrolling instead. */
const MIN_SLOT: Record<string, number> = { day: 20, week: 26, month: 26 };

/**
 * The span the chart draws. With a date filter on, it is exactly the filter's
 * span. With no filter it runs from the contributor's very first pull request
 * to today, so every pull request they have ever opened is on the chart —
 * issue #20 asked for a graph that tracks all of someone's work, and a fixed
 * recent window silently drops everything older than itself. When that is more
 * than fits the card, the chart scrolls sideways rather than dropping months.
 *
 * The one guard is a floor: the window is never shorter than three months, so
 * a brand-new contributor gets a readable chart instead of a lone bar.
 */
function chartWindow(
  prs: StudentPR[],
  period: string | undefined,
  from: string | undefined,
  to: string | undefined,
  nowMs: number
): { start: number; end: number } {
  const range = periodRange(period, from, to);
  if (range) {
    return { start: range.min, end: Math.min(range.max, nowMs) + 1 };
  }

  const now = new Date(nowMs);
  const monthStart = (d: Date, offset = 0) => new Date(d.getFullYear(), d.getMonth() + offset, 1);

  let oldest = Infinity;
  let newest = 0;
  for (const pr of prs) {
    const t = new Date(pr.created_at).getTime();
    if (Number.isNaN(t)) continue;
    if (t < oldest) oldest = t;
    if (t > newest) newest = t;
  }

  // Nothing to plot — fall back to a plain twelve-month frame.
  if (!Number.isFinite(oldest)) {
    return { start: monthStart(now, -11).getTime(), end: monthStart(now, 1).getTime() };
  }

  // If every pull request predates the safety ceiling, anchor the window on
  // the newest one so their history is what gets drawn, not empty months.
  const end = monthStart(newest && newest < monthStart(now, -MAX_BUCKETS).getTime() ? new Date(newest) : now, 1);
  // At least three months of frame, so one recent pull request is not drawn
  // as a lone bar with nothing around it.
  const start = monthStart(new Date(Math.min(oldest, monthStart(end, -3).getTime())));

  return { start: start.getTime(), end: end.getTime() };
}

/**
 * Empty buckets covering [start, end), sized to the span.
 *
 * Each granularity has a cap on how many bars it will draw. When a span needs
 * more than that, the OLDEST buckets are dropped rather than the newest — a
 * three-year custom range must still end at today, or the chart would show an
 * empty window while the stat cards beside it count hundreds of pull requests.
 */
function makeBuckets(start: number, end: number): { buckets: Bucket[]; unit: string } {
  const spanDays = (end - start) / 86_400_000;
  const buckets: Bucket[] = [];
  const empty = (): Record<SeriesKey, number> => ({ merged: 0, open: 0, closed: 0 });
  // Belt and braces against a pathological range (a hand-edited `from=1970`):
  // stop generating long before the loop could become expensive.
  const HARD_LIMIT = 2000;

  const push = (from: Date, to: Date, label: string, full: string) => {
    buckets.push({ start: from.getTime(), end: to.getTime(), label, full, counts: empty(), total: 0, partial: false });
  };

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  if (spanDays <= 35) {
    while (cursor.getTime() < end && buckets.length < HARD_LIMIT) {
      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);
      const isMonthStart = cursor.getDate() === 1 || buckets.length === 0;
      push(cursor, next,
        isMonthStart
          ? cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : String(cursor.getDate()),
        cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { buckets: buckets.slice(-MAX_BUCKETS), unit: 'day' };
  }

  if (spanDays <= 210) {
    // Start each week on a Monday so the bars line up with how people read weeks.
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    while (cursor.getTime() < end && buckets.length < HARD_LIMIT) {
      const next = new Date(cursor);
      next.setDate(next.getDate() + 7);
      const short = cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      push(cursor, next, short, `Week of ${short}`);
      cursor.setDate(cursor.getDate() + 7);
    }
    return { buckets: buckets.slice(-MAX_BUCKETS), unit: 'week' };
  }

  cursor.setDate(1);
  while (cursor.getTime() < end && buckets.length < HARD_LIMIT) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    push(cursor, next, '', cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const kept = buckets.slice(-MAX_BUCKETS);
  // Labelled only after trimming, so "which months span more than one year" is
  // decided on what will actually be drawn.
  const multiYear =
    kept.length > 0 &&
    new Date(kept[0].start).getFullYear() !== new Date(kept[kept.length - 1].start).getFullYear();
  kept.forEach((b, i) => {
    const d = new Date(b.start);
    b.label =
      multiYear && (d.getMonth() === 0 || i === 0)
        ? `${d.toLocaleDateString('en-US', { month: 'short' })} \u2019${String(d.getFullYear()).slice(2)}`
        : d.toLocaleDateString('en-US', { month: 'short' });
  });

  return { buckets: kept, unit: 'month' };
}

function buildChartData(
  prs: StudentPR[],
  period: string | undefined,
  from: string | undefined,
  to: string | undefined,
  nowMs: number
) {
  const window = chartWindow(prs, period, from, to, nowMs);
  const { buckets, unit } = makeBuckets(window.start, window.end);

  for (const bucket of buckets) {
    bucket.partial = bucket.end > nowMs && bucket.start <= nowMs;
  }

  for (const pr of prs) {
    const time = new Date(pr.created_at).getTime();
    const bucket = buckets.find((b) => time >= b.start && time < b.end);
    if (!bucket) continue;

    const key: SeriesKey = pr.pull_request?.merged_at ? 'merged' : pr.state === 'open' ? 'open' : 'closed';
    bucket.counts[key]++;
    bucket.total++;
  }

  return { buckets, unit };
}

/** A bar segment: square where it meets the bar below, rounded where it ends. */
function segmentPath(x: number, y: number, w: number, h: number, round: boolean): string {
  const r = round ? Math.min(4, w / 2, h) : 0;
  if (!r) return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
  return `M ${x} ${y + r} a ${r} ${r} 0 0 1 ${r} ${-r} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - r} h ${-w} Z`;
}

export function ContributionChart({
  prs,
  period,
  from,
  to,
  nowMs,
}: {
  prs: StudentPR[];
  period?: string;
  from?: string;
  to?: string;
  /** Passed in rather than read here, so the whole page shares one "now". */
  nowMs: number;
}) {
  const { buckets, unit } = buildChartData(prs, period, from, to, nowMs);

  const totals = buckets.reduce(
    (acc, b) => {
      acc.merged += b.counts.merged;
      acc.open += b.counts.open;
      acc.closed += b.counts.closed;
      acc.all += b.total;
      return acc;
    },
    { merged: 0, open: 0, closed: 0, all: 0 }
  );

  const unitPlural = unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'month';

  // Naming the span matters: the stat cards above count a contributor's whole
  // history, so without it a reader sees 187 in the cards, 184 in the legend
  // and has no way to know the difference is three older pull requests.
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const spanFmt: Intl.DateTimeFormatOptions =
    unit === 'month' ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' };
  const span =
    first && last
      ? `${new Date(first.start).toLocaleDateString('en-US', spanFmt)} – ${new Date(
          Math.min(last.end - 1, nowMs)
        ).toLocaleDateString('en-US', spanFmt)}`
      : '';

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-1">
      <h2 className="text-ink text-sm font-[650]">Contribution history</h2>
      <p className="text-ink-soft text-xs">
        Pull requests opened each {unitPlural}
        {span && <span className="text-ink-faint"> · {span}</span>}
      </p>
    </div>
  );

  if (totals.all === 0) {
    return (
      <div className="bg-white border border-line rounded-2xl shadow-card p-5">
        {header}
        <p className="text-ink-soft text-[13px] leading-relaxed mt-3">
          No pull requests were opened in this period. A pull request is a proposed change
          someone sends to a project they don&apos;t own — this chart fills in once there is one.
        </p>
      </div>
    );
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  // The card is ~680 units wide. If that would squeeze the bars below a
  // readable slot, the SVG grows past it instead and the card scrolls
  // sideways — nobody's history gets dropped to make the picture fit.
  const BASE_WIDTH = 680;
  const height = 200;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 18;
  const padBottom = 30;

  // Two different widths. `minWidthPx` is the narrowest the chart may render
  // before the card scrolls instead of squeezing the bars — it grows with the
  // number of buckets. `width` is the drawing coordinate system, held at the
  // card's own width until the buckets need more, so a three-bar chart is not
  // magnified to fill the card.
  const minSlot = MIN_SLOT[unit] ?? 26;
  const minWidthPx = padLeft + buckets.length * minSlot + padRight;
  const width = Math.max(BASE_WIDTH, minWidthPx);

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const baseline = padTop + plotH;

  const peak = Math.max(...buckets.map((b) => b.total));
  const axisMax = niceMax(peak);
  const slot = plotW / buckets.length;
  const barW = Math.min(24, slot * 0.64);
  const gap = 2; // surface gap between stacked segments

  const centerOf = (i: number) => padLeft + slot * (i + 0.5);
  const yFor = (value: number) => baseline - (value / axisMax) * plotH;

  // Only the tallest bar carries a printed value; the axis and the hover
  // readout cover the rest, and a number over every bar is unreadable.
  const peakIndex = buckets.findIndex((b) => b.total === peak);

  // Thin the x-axis labels down to what actually fits. Every label is kept at
  // least 30 units from the previous one, so they can never overlap however
  // many buckets there are.
  // The ends and the first day of a new month are the labels worth keeping, so
  // they are placed first and the evenly-spaced ones fill in around them.
  const labelStep = Math.ceil(buckets.length / 12);
  const labelIndices: number[] = [];
  const labelWidth = (i: number) => buckets[i].label.length * 5.6;
  const claimLabel = (i: number) => {
    if (i < 0 || i >= buckets.length) return;
    const x = centerOf(i);
    const room = (j: number) => (labelWidth(i) + labelWidth(j)) / 2 + 8;
    if (labelIndices.some((j) => Math.abs(centerOf(j) - x) < room(j))) return;
    labelIndices.push(i);
  };

  claimLabel(0);
  claimLabel(buckets.length - 1);
  // A boundary label ("Sep 1", "Jan ’26") is worth more than an evenly-spaced
  // one, so it gets to claim its space first.
  buckets.forEach((b, i) => {
    const d = new Date(b.start);
    const boundary = unit === 'day' ? d.getDate() === 1 : unit === 'month' && d.getMonth() === 0;
    if (boundary) claimLabel(i);
  });
  for (let i = 0; i < buckets.length; i += labelStep) claimLabel(i);
  labelIndices.sort((a, b) => a - b);

  const ticks = [0, axisMax / 2, axisMax];

  const partialBucket = buckets.find((b) => b.partial && b.total > 0);

  return (
    <div className="bg-white border border-line rounded-2xl shadow-card p-5">
      {header}

      {/* Legend — identity never rests on colour alone */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 mb-1">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-mid">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
            {s.label}
            <span className="tabular-nums text-ink-soft">{totals[s.key]}</span>
          </span>
        ))}
      </div>

      {/* The chart fills the card when it fits and scrolls when it does not —
          `min-width` is what decides, so bars never shrink below a readable
          slot. `direction: rtl` parks that scroll at the right-hand end on
          load, so the most recent months are what a reader sees first; the
          chart itself flips back to ltr so it is not mirrored. When nothing
          overflows, the rtl has no effect at all. */}
      <div className="overflow-x-auto" style={{ direction: 'rtl' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto overflow-visible"
        style={{ direction: 'ltr', width: '100%', minWidth: `${minWidthPx}px` }}
        role="img"
        aria-label={`Pull requests opened each ${unitPlural}: ${totals.all} in total, of which ${totals.merged} merged, ${totals.open} open and ${totals.closed} closed without merging.`}
      >
        {/* Gridlines */}
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={padLeft} y1={yFor(value)} x2={width - padRight} y2={yFor(value)}
              stroke={value === 0 ? '#e1e5ea' : '#edeff3'} strokeWidth="1"
            />
            <text
              x={padLeft - 8} y={yFor(value) + 3.5} textAnchor="end"
              fontSize="10" fill="#8c95a6" className="tabular-nums"
            >
              {value}
            </text>
          </g>
        ))}

        {/* Bars */}
        {buckets.map((bucket, i) => {
          if (!bucket.total) return null;
          const x = centerOf(i) - barW / 2;

          let cursorY = baseline;
          const drawn: Array<{ y: number; h: number; color: string }> = [];
          for (const s of SERIES) {
            const value = bucket.counts[s.key];
            if (!value) continue;
            // A single pull request in a tall month is under three pixels and
            // would vanish; floor it so "some" never renders as "none".
            const h = Math.max(3, (value / axisMax) * plotH);
            cursorY -= h;
            drawn.push({ y: cursorY, h, color: s.color });
          }

          return (
            <g key={bucket.start} opacity={bucket.partial ? 0.45 : 1}>
              {drawn.map((seg, si) => {
                // Everything above the bottom segment gives up 2px at its base,
                // so the surface itself separates the colours.
                const trimmed = si > 0 && seg.h > gap + 0.5 ? seg.h - gap : seg.h;
                return (
                  <path
                    key={si}
                    d={segmentPath(x, seg.y, barW, trimmed, si === drawn.length - 1)}
                    fill={seg.color}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Value on the tallest bar only */}
        {peak > 0 && (
          <text
            x={centerOf(peakIndex)} y={yFor(peak) - 6} textAnchor="middle"
            fontSize="10.5" fontWeight="650" fill="#30363d" className="tabular-nums"
          >
            {peak}
          </text>
        )}

        {/* X-axis labels */}
        {labelIndices.map((i) => (
          <text
            key={buckets[i].start} x={centerOf(i)} y={height - 12} textAnchor="middle"
            fontSize="10" fill="#5b6271"
          >
            {buckets[i].label}
          </text>
        ))}

        {/* Hover and keyboard layer, drawn last so a readout is never painted over */}
        {buckets.map((bucket, i) => {
          const cx = centerOf(i);
          const rows = SERIES.filter((s) => bucket.counts[s.key] > 0);
          const heading = bucket.partial ? `${bucket.full} · so far` : bucket.full;
          const emptyNote = 'Nothing opened';

          // The box is sized from its longest line, so no readout is ever clipped.
          const lineWidths = rows.length
            ? rows.map((s) => `${bucket.counts[s.key]} ${s.label.toLowerCase()}`.length * 5.4 + 32)
            : [emptyNote.length * 5.4 + 20];
          const boxW = Math.max(heading.length * 5.4 + 20, ...lineWidths, 76);
          const boxH = 20 + Math.max(rows.length, 1) * 13;
          const top = bucket.total ? yFor(bucket.total) : baseline;
          const below = top - boxH - 10 < 0;
          const boxY = below ? top + 12 : top - boxH - 10;
          const boxX = Math.min(Math.max(cx - boxW / 2, 2), width - boxW - 2);

          return (
            <g key={`hit-${bucket.start}`} className="group/bar" tabIndex={bucket.total ? 0 : undefined}>
              <rect
                x={cx - slot / 2} y={padTop} width={slot} height={plotH}
                fill="transparent" className="cursor-help"
              />
              <rect
                x={cx - slot / 2} y={padTop} width={slot} height={plotH}
                fill="#0b0c0e"
                className="opacity-0 group-hover/bar:opacity-[0.035] group-focus-visible/bar:opacity-[0.035] transition-opacity pointer-events-none"
              />
              <g className="opacity-0 group-hover/bar:opacity-100 group-focus-visible/bar:opacity-100 transition-opacity pointer-events-none">
                <rect x={boxX} y={boxY} width={boxW} height={boxH} rx="7" fill="#0b0c0e" />
                <text x={boxX + 10} y={boxY + 13} fontSize="9.5" fill="#c9cfd9">
                  {heading}
                </text>
                {rows.map((s, ri) => (
                  <g key={s.key}>
                    <rect
                      x={boxX + 10} y={boxY + 21 + ri * 13} width="7" height="2.5" rx="1.25"
                      fill={s.color}
                    />
                    <text
                      x={boxX + 22} y={boxY + 25 + ri * 13} fontSize="10" fill="#ffffff"
                    >
                      <tspan fontWeight="650" className="tabular-nums">{bucket.counts[s.key]}</tspan>
                      <tspan fill="#c9cfd9"> {s.label.toLowerCase()}</tspan>
                    </text>
                  </g>
                ))}
                {rows.length === 0 && (
                  <text x={boxX + 10} y={boxY + 25} fontSize="10" fill="#c9cfd9">
                    {emptyNote}
                  </text>
                )}
              </g>
            </g>
          );
        })}
      </svg>
      </div>

      {partialBucket && (
        <p className="text-ink-soft text-[11.5px] mt-2">
          The faded bar is the {unitPlural} in progress — it counts only what has
          happened so far.
        </p>
      )}
    </div>
  );
}
