'use client';

import { useState } from 'react';

export interface RepoMonth {
  month: string;
  /** Distinct community contributors (not maintainers, not bots) who opened a PR. */
  contributors: number;
  maintainersActive: number;
  opened: number;
  merged: number;
  issues: number;
}

const monthLabel = (m: string, long = false) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' });

/**
 * Contributors per month for one repository: bars are the distinct community
 * contributors who opened a pull request that month (maintainers and bots
 * left out, same as the ranked list), a thin line is pull requests merged.
 * Hovering a bar shows the month's numbers.
 */
export function RepoActivityChart({ monthly, since, truncated }: { monthly: RepoMonth[]; since: string | null; truncated: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const series = monthly.slice(-18);
  if (series.length === 0) return null;

  const width = 720;
  const height = 200;
  const padLeft = 34;
  const padRight = 34;
  const padTop = 10;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const baseline = padTop + plotH;
  const n = series.length;
  const slot = plotW / n;
  const barW = Math.max(8, Math.min(40, slot * 0.6));
  const xFor = (i: number) => padLeft + slot * i + slot / 2;
  const maxC = Math.max(1, ...series.map((b) => b.contributors));
  const maxM = Math.max(1, ...series.map((b) => b.merged));
  const yC = (v: number) => baseline - (v / maxC) * plotH;
  const yM = (v: number) => baseline - (v / maxM) * plotH;
  const line = series.map((b, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yM(b.merged).toFixed(1)}`).join(' ');
  const h = hover !== null ? series[hover] : null;
  const total = series.reduce((a, b) => a + b.contributors, 0);

  return (
    <div className="bg-ground border border-line rounded-2xl p-5 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-ink text-sm font-[650]">Contributors per month</h2>
        <p className="text-ink-soft text-xs">
          {since ? `since ${new Date(since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
          {truncated ? ' · newest 500 pull requests only' : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 mb-1 text-[11.5px] text-ink-mid">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: 'var(--color-violet-500)' }} />Community contributors who opened a PR</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ backgroundColor: 'var(--color-success-500)' }} />PRs merged (right axis)</span>
        <span className="text-ink-faint">· maintainers and bots excluded</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible select-none" role="img"
          aria-label={`Contributors per month: ${total} contributor-months across ${n} months.`}
          onPointerLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={padLeft} y1={baseline - t * plotH} x2={width - padRight} y2={baseline - t * plotH} stroke={t === 0 ? 'var(--color-line-strong)' : 'var(--color-line)'} strokeDasharray={t === 0 ? undefined : '2 4'} />
              <text x={padLeft - 8} y={baseline - t * plotH + 3.5} textAnchor="end" fontSize="10" fill="var(--color-ink-faint)" className="tabular-nums">{Math.round(t * maxC)}</text>
              <text x={width - padRight + 8} y={baseline - t * plotH + 3.5} textAnchor="start" fontSize="10" fill="var(--color-success-500)" opacity="0.8" className="tabular-nums">{Math.round(t * maxM)}</text>
            </g>
          ))}
          {series.map((b, i) => (
            <g key={b.month} onPointerEnter={() => setHover(i)}>
              <rect x={xFor(i) - slot / 2} y={padTop} width={slot} height={plotH + padBottom} fill="transparent" />
              {b.contributors > 0 && (
                <rect x={xFor(i) - barW / 2} y={yC(b.contributors)} width={barW} height={baseline - yC(b.contributors)} rx={4} fill="var(--color-violet-500)" opacity={hover === null || hover === i ? 0.9 : 0.45} />
              )}
              <text x={xFor(i)} y={baseline + 16} textAnchor="middle" fontSize="10.5" fill={hover === i ? 'var(--color-ink)' : 'var(--color-ink-soft)'} fontWeight={hover === i ? 650 : 450}>{monthLabel(b.month)}</text>
            </g>
          ))}
          <path d={line} fill="none" stroke="var(--color-success-500)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
          {hover !== null && (
            <>
              <line x1={xFor(hover)} y1={padTop} x2={xFor(hover)} y2={baseline} stroke="var(--color-ink-faint)" strokeDasharray="3 3" />
              <circle cx={xFor(hover)} cy={yM(series[hover].merged)} r="4" fill="var(--color-ground)" stroke="var(--color-success-500)" strokeWidth="2" />
            </>
          )}
        </svg>
        {h && hover !== null && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-line bg-ground/95 backdrop-blur px-3 py-2.5 shadow-pop text-[12px] min-w-[200px]" style={{ left: `clamp(110px, ${(xFor(hover) / width) * 100}%, calc(100% - 110px))` }}>
            <div className="font-[650] text-ink mb-1">{monthLabel(h.month, true)}</div>
            {[
              ['Community contributors', h.contributors],
              ['Maintainers active', h.maintainersActive],
              ['PRs opened', h.opened],
              ['PRs merged', h.merged],
              ['Issues opened', h.issues],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-center justify-between gap-4 leading-6">
                <span className="text-ink-mid">{k}</span>
                <span className="tabular-nums font-[600] text-ink">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
