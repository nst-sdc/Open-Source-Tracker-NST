import Link from 'next/link';
import type { MonthBucket } from '@/lib/community-timeline';

/**
 * The community's activity by month, drawn server-side as inline SVG like
 * the per-contributor chart: bars for merged pull requests, a line for pull
 * requests opened, and the number of students who had a merge under each
 * month. `compact` is the home-page sparkline: bars only, one headline
 * number, and a link to the full chart.
 */
export function CommunityChart({
  series,
  compact = false,
  scopeLabel,
  href = '/contributors',
}: {
  series: MonthBucket[];
  compact?: boolean;
  /** e.g. "ADYPU · 2nd year" when the contributors page is filtered. */
  scopeLabel?: string;
  href?: string;
}) {
  const totals = series.reduce(
    (a, b) => ({ opened: a.opened + b.opened, merged: a.merged + b.merged, issues: a.issues + b.issues }),
    { opened: 0, merged: 0, issues: 0 },
  );
  const monthLabel = (m: string, long = false) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  const span = series.length ? `${monthLabel(series[0].month, true)} – ${monthLabel(series[series.length - 1].month, true)}` : '';
  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  // ── Geometry ──────────────────────────────────────────────────────────────
  const width = 680;
  const height = compact ? 72 : 220;
  const padLeft = compact ? 0 : 34;
  const padRight = compact ? 0 : 8;
  const padTop = compact ? 4 : 10;
  const padBottom = compact ? 4 : 44;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const baseline = padTop + plotH;
  const slot = plotW / Math.max(1, series.length);
  const barW = Math.max(6, Math.min(36, slot * 0.58));
  const centerOf = (i: number) => padLeft + slot * i + slot / 2;
  const maxVal = Math.max(1, ...series.map((b) => Math.max(b.merged, b.opened)));
  const niceMax = (() => {
    const pow = 10 ** Math.floor(Math.log10(maxVal));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * pow >= maxVal) return k * pow;
    return maxVal;
  })();
  const yFor = (v: number) => baseline - (v / niceMax) * plotH;
  const ticks = compact ? [] : [0, niceMax / 2, niceMax].map((v) => Math.round(v));
  const linePath = series.map((b, i) => `${i === 0 ? 'M' : 'L'}${centerOf(i).toFixed(1)},${yFor(b.opened).toFixed(1)}`).join(' ');

  if (totals.opened === 0 && totals.merged === 0) {
    if (compact) return null;
    return (
      <div className="bg-ground border border-line rounded-2xl shadow-card p-5">
        <h2 className="text-ink text-sm font-[650]">Community activity</h2>
        <p className="text-ink-soft text-[13px] mt-2">No activity recorded yet{scopeLabel ? ` for ${scopeLabel}` : ''}. The chart fills in after the next refresh.</p>
      </div>
    );
  }

  const svg = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full overflow-visible"
      role="img"
      aria-label={`Community activity by month${scopeLabel ? ` for ${scopeLabel}` : ''}: ${totals.merged} pull requests merged and ${totals.opened} opened across ${series.length} months.`}
    >
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padLeft} y1={yFor(v)} x2={width - padRight} y2={yFor(v)} stroke={v === 0 ? 'var(--color-line-strong)' : 'var(--color-line)'} strokeWidth="1" />
          <text x={padLeft - 8} y={yFor(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-ink-faint)" className="tabular-nums">{v}</text>
        </g>
      ))}
      {series.map((b, i) => {
        const h = b.merged ? Math.max(2, (b.merged / niceMax) * plotH) : 0;
        return (
          <g key={b.month} opacity={b.partial ? 0.5 : 1}>
            <title>{`${monthLabel(b.month, true)}${b.partial ? ' (so far)' : ''}: ${b.merged} merged, ${b.opened} opened, ${b.issues} issues, ${b.contributors} students with a merge`}</title>
            {h > 0 && <rect x={centerOf(i) - barW / 2} y={baseline - h} width={barW} height={h} rx={compact ? 2 : 4} fill="var(--color-success-500)" />}
            {!compact && (
              <>
                <text x={centerOf(i)} y={baseline + 14} textAnchor="middle" fontSize="10.5" fill="var(--color-ink-soft)">{monthLabel(b.month)}</text>
                <text x={centerOf(i)} y={baseline + 28} textAnchor="middle" fontSize="10" fill="var(--color-ink-faint)" className="tabular-nums">{b.contributors ? `${b.contributors}` : '·'}</text>
              </>
            )}
          </g>
        );
      })}
      {!compact && (
        <>
          <path d={linePath} fill="none" stroke="var(--color-brand-500)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {series.map((b, i) => (
            <circle key={b.month} cx={centerOf(i)} cy={yFor(b.opened)} r="3" fill="var(--color-ground)" stroke="var(--color-brand-500)" strokeWidth="2" />
          ))}
          <text x={padLeft} y={height - 2} fontSize="9.5" fill="var(--color-ink-faint)">students with a merge, per month ↑</text>
        </>
      )}
    </svg>
  );

  if (compact) {
    const delta = last && prev ? last.merged - prev.merged : 0;
    return (
      <Link href={href} className="block bg-ground border border-line rounded-2xl shadow-card p-5 hover:border-brand-400 transition-colors group">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-[650] uppercase tracking-wider text-ink-soft">Merged PRs per month</div>
            <div className="mt-1 text-[22px] leading-none font-[650] tabular-nums text-success-600">
              {last?.merged.toLocaleString('en-IN') ?? 0}
              <span className="ml-2 text-[12px] font-[550] text-ink-soft">this month so far</span>
            </div>
          </div>
          <div className="text-right text-[12px] text-ink-soft">
            <div className="tabular-nums">{prev?.merged.toLocaleString('en-IN') ?? 0} last month</div>
            {prev && <div className={delta >= 0 ? 'text-success-600' : 'text-ink-soft'}>{delta >= 0 ? '+' : ''}{delta} vs last month</div>}
          </div>
        </div>
        <div className="mt-3">{svg}</div>
        <div className="mt-2 text-[12px] font-[550] text-brand-600 group-hover:text-brand-500">See the full community chart →</div>
      </Link>
    );
  }

  return (
    <div className="bg-ground border border-line rounded-2xl shadow-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-ink text-sm font-[650]">Community activity{scopeLabel ? <span className="text-ink-soft font-[500]"> · {scopeLabel}</span> : ''}</h2>
        <p className="text-ink-soft text-xs">By month <span className="text-ink-faint">· {span}</span></p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 mb-1 text-[11.5px] text-ink-mid">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: 'var(--color-success-500)' }} />Merged <span className="tabular-nums text-ink-soft">{totals.merged.toLocaleString('en-IN')}</span></span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ backgroundColor: 'var(--color-brand-500)' }} />Opened <span className="tabular-nums text-ink-soft">{totals.opened.toLocaleString('en-IN')}</span></span>
        <span className="inline-flex items-center gap-1.5 text-ink-soft">Issues <span className="tabular-nums">{totals.issues.toLocaleString('en-IN')}</span></span>
        <span className="text-ink-faint">· the running month is drawn lighter</span>
      </div>
      {svg}
    </div>
  );
}
