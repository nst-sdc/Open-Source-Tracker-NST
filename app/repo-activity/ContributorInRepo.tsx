'use client';

import { dateShort, Row, Tile, type PanelContributor } from './MaintainerPanel';

/**
 * What a community contributor did in THIS repository during the selected
 * period. It leads the details panel: someone looking at a repository wants
 * to know what this person did here before what they did elsewhere.
 */
export function ContributorInRepo({ contributor: c, repoName }: { contributor: PanelContributor; repoName: string }) {
  const prs = [...c.prs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-[650] text-ink-mid uppercase tracking-wider">In {repoName}</h4>
        <span className="text-[10px] text-ink-faint">selected period</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tile label="PRs opened" value={c.prsCount} />
        <Tile label="Merged" value={c.mergedPRs} tone="text-success-600" />
        <Tile label="Still open" value={c.openPRs} tone="text-brand-600" />
        <Tile label="Issues opened" value={c.issuesCount} tone="text-violet-600" />
      </div>
      {prs.length === 0 ? (
        <p className="text-sm text-ink-soft italic">No pull request here in this period.</p>
      ) : (
        <div className="space-y-2">
          {prs.map((pr) => (
            <Row
              key={pr.number}
              href={pr.url}
              number={pr.number}
              title={pr.title}
              when={`opened ${dateShort(pr.createdAt)}${pr.mergedAt ? ` · merged ${dateShort(pr.mergedAt)}` : ''}`}
              badge={pr.mergedAt ? 'merged' : pr.state}
              tone={pr.state === 'open' ? 'bg-brand-0 border-brand-100 text-brand-600' : pr.mergedAt ? 'bg-success-0 border-success-100 text-success-600' : 'bg-violet-0 border-violet-100 text-violet-600'}
            />
          ))}
        </div>
      )}
      {c.issues.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-[600] text-ink-mid">Issues</div>
          {c.issues.map((i) => (
            <Row key={i.number} href={i.url} number={i.number} title={i.title} when={`opened ${dateShort(i.createdAt)}`} badge={i.state} tone={i.state === 'open' ? 'bg-brand-0 border-brand-100 text-brand-600' : 'bg-violet-0 border-violet-100 text-violet-600'} />
          ))}
        </div>
      )}
    </div>
  );
}
