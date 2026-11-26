/**
 * A capsule split into merged / open / closed-without-merge, with the three
 * shares beneath and the counts in the tooltip. Pure markup: widths are
 * shares of the total. Used in the community chart's hover card.
 */
const PARTS = [
  { key: 'merged', label: 'merged', color: 'bg-success-500' },
  { key: 'open', label: 'open', color: 'bg-brand-500' },
  { key: 'closed', label: 'closed', color: 'bg-warning-400' },
] as const;

export function PROutcomeCapsule({ merged, open, closed }: { merged: number; open: number; closed: number }) {
  const total = merged + open + closed;
  if (total <= 0) return null;
  const counts = { merged, open, closed };
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const title = PARTS.map((p) => `${counts[p.key].toLocaleString('en-IN')} ${p.label} (${Math.round((counts[p.key] / total) * 100)}%)`).join(' · ');
  return (
    <div className="mt-1.5" title={title}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={`Pull requests by outcome: ${title}`}>
        {PARTS.map((p) => counts[p.key] > 0 && <span key={p.key} className={`h-full ${p.color}`} style={{ width: pct(counts[p.key]) }} />)}
      </div>
      <div className="mt-1 whitespace-nowrap text-[11px] text-ink-soft tabular-nums">
        {PARTS.map((p, i) => (
          <span key={p.key}>
            {i > 0 && <span className="mx-1 text-ink-faint">·</span>}
            {Math.round((counts[p.key] / total) * 100)}% {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
