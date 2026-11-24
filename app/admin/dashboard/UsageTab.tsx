'use client';

import { useEffect, useState } from 'react';
import type { UsageDayRow, UsageReport } from '@/lib/usage';

type Metric = 'visitors' | 'users' | 'views';

const METRICS: Array<{ key: Metric; label: string }> = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'users', label: 'Signed in' },
  { key: 'views', label: 'Page views' },
];
const RANGES = [7, 30, 90] as const;

const fmt = (n: number) => n.toLocaleString('en-IN');
const dayLabel = (day: string, long = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', ...(long ? { weekday: 'short' } : {}), timeZone: 'UTC',
  });

function niceCeil(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 4, 5, 8, 10]) if (k * pow >= v) return k * pow;
  return v;
}

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl px-4 py-3">
      <div className="text-ink-soft text-xs">{label}</div>
      <div className="text-ink text-2xl font-[600] tabular-nums mt-0.5">{fmt(value)}</div>
      {note && <div className="text-ink-soft text-xs mt-0.5">{note}</div>}
    </div>
  );
}

/** One bar per day for the chosen measure; hovering a day reads out all three. */
function DailyChart({ days, metric }: { days: UsageDayRow[]; metric: Metric }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, L = 40, R = 8, T = 10, B = 26;
  const top = niceCeil(Math.max(...days.map((d) => d[metric])));
  const slot = (W - L - R) / days.length;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const every = Math.ceil(days.length / 8);
  const active = hover !== null ? days[hover] : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`${METRICS.find((m) => m.key === metric)?.label} per day`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke="var(--color-line-strong)" strokeWidth={1} />
            <text x={L - 6} y={y(top * f) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-ink-soft)">{fmt(top * f)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = L + slot * i + (slot - barW) / 2;
          const h = Math.max(d[metric] > 0 ? 2 : 0, H - B - y(d[metric]));
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.day}>
              {h > 0 && (
                <path
                  d={`M${x},${H - B} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                  fill="var(--color-brand-500)" opacity={hover === null || hover === i ? 1 : 0.45} />
              )}
              {i % every === 0 && (
                <text x={L + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-ink-soft)">
                  {dayLabel(d.day)}
                </text>
              )}
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent"
                onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {active && hover !== null && (
        <div className="absolute top-1 pointer-events-none bg-ground border border-line-strong rounded-lg shadow-sm px-3 py-2 text-xs z-10"
          style={hover < days.length / 2
            ? { left: `${((L + slot * (hover + 1)) / W) * 100}%` }
            : { right: `${100 - ((L + slot * hover) / W) * 100}%` }}>
          <div className="text-ink font-[550] mb-1 whitespace-nowrap">{dayLabel(active.day, true)}</div>
          {([['Visitors', active.visitors], ['New', active.newVisitors], ['Signed in', active.users], ['Page views', active.views]] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 text-ink-soft whitespace-nowrap">
              <span>{k}</span><span className="text-ink tabular-nums">{fmt(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RankList({ title, empty, rows }: { title: string; empty: string; rows: Array<{ name: string; views: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <div className="border border-line rounded-xl p-4">
      <h3 className="text-ink text-sm font-[550] mb-3">{title}</h3>
      {rows.length === 0 ? <p className="text-ink-soft text-sm">{empty}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-ink truncate">{r.name}</span>
                <span className="text-ink-soft tabular-nums">{fmt(r.views)}</span>
              </div>
              <div className="h-1 mt-1 rounded-full bg-panel-2">
                <div className="h-1 rounded-full bg-brand-500" style={{ width: `${(r.views / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Hours({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  return (
    <div className="border border-line rounded-xl p-4">
      <h3 className="text-ink text-sm font-[550]">Time of day</h3>
      <p className="text-ink-soft text-xs mb-3">
        Page views by hour, Indian time{max > 1 ? `. Busiest around ${String(peak).padStart(2, '0')}:00.` : '.'}
      </p>
      <div className="flex items-end gap-[2px] h-16">
        {hours.map((n, h) => (
          <div key={h} title={`${String(h).padStart(2, '0')}:00 — ${fmt(n)} views`} className="flex-1 h-full flex items-end">
            <div className="w-full rounded-t-sm bg-brand-500" style={{ height: `${n ? Math.max(4, (n / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-ink-soft mt-1"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
    </div>
  );
}

export default function UsageTab() {
  const [range, setRange] = useState<number>(30);
  const [metric, setMetric] = useState<Metric>('visitors');
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/usage?days=${range}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok) { setReport(data as UsageReport); setError(''); }
        else setError(data.error ?? 'Could not load usage.');
      })
      .catch(() => { if (live) setError('Could not load usage.'); });
    return () => { live = false; };
  }, [range]);

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-[500] border transition-all cursor-pointer ${
      on ? 'bg-panel text-ink border-line-strong' : 'text-ink-soft border-transparent hover:text-ink-mid'}`;

  const today = report?.days.at(-1);
  const yesterday = report?.days.at(-2);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h2 className="text-ink font-[550]">Usage</h2>
          <p className="text-ink-soft text-sm mt-0.5 max-w-2xl">
            How many people open the site each day. A visitor is one browser; signed in means a GitHub account. Only counts
            are kept, never who looked at what. Days run midnight to midnight, Indian time.
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)} className={chip(range === r)}>{r} days</button>
          ))}
        </div>
      </div>

      {error && <p className="text-error-500 text-sm mb-4">{error}</p>}
      {!report && !error && <p className="text-ink-soft text-sm">Loading…</p>}

      {report && today && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Tile label="Visitors today" value={today.visitors} note={yesterday ? `${fmt(yesterday.visitors)} yesterday` : undefined} />
            <Tile label="Signed in today" value={today.users} note={yesterday ? `${fmt(yesterday.users)} yesterday` : undefined} />
            <Tile label="Visitors, last 7 days" value={report.weekVisitors} note={`${fmt(report.weekUsers)} signed in`} />
            <Tile label={`Visitors, last ${range} days`} value={report.rangeVisitors} note={`${fmt(report.rangeUsers)} signed in`} />
            <Tile label={`Page views, last ${range} days`} value={report.totalViews} />
          </div>

          {report.totalViews === 0 ? (
            <p className="text-ink-soft text-sm border border-line rounded-xl p-6">
              Nothing counted yet. Counting starts from the first page opened after this version went live.
            </p>
          ) : (
            <>
              <div className="border border-line rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-ink text-sm font-[550]">{METRICS.find((m) => m.key === metric)?.label} per day</h3>
                  <div className="flex gap-1">
                    {METRICS.map((m) => (
                      <button key={m.key} onClick={() => setMetric(m.key)} className={chip(metric === m.key)}>{m.label}</button>
                    ))}
                  </div>
                </div>
                <DailyChart days={report.days} metric={metric} />
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <RankList title="Pages" empty="No pages yet."
                  rows={report.pages.map((p) => ({ name: p.path, views: p.views }))} />
                <div className="space-y-6">
                  <RankList title="Arrived from" empty="No outside links yet; people typed the address or used a bookmark."
                    rows={report.referrers.map((r) => ({ name: r.host, views: r.views }))} />
                  <Hours hours={report.hours} />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
