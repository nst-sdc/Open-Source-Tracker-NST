'use client';

import { useMemo } from 'react';
import { buildHeatmap, WEEKDAY_LONG, type MaintainerEvent } from '@/lib/maintainer-heatmap';

export interface PanelContributor {
  username: string;
  avatarUrl: string;
  prsCount: number;
  mergedPRs: number;
  openPRs: number;
  closedPRs: number;
  issuesCount: number;
  isMaintainer: boolean;
  isBot?: boolean;
  prs: Array<{ number: number; title: string; url: string; state: string; createdAt: string; mergedAt: string | null }>;
  issues: Array<{ number: number; title: string; url: string; state: string; createdAt: string }>;
}

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const dateShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

function Tile({ label, value, tone = 'text-ink' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-ground border border-line rounded-xl px-3 py-2.5 text-center">
      <div className="text-[10px] text-ink-soft">{label}</div>
      <div className={`font-mono font-[650] text-base tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function Row({ href, number, title, when, badge, tone }: { href: string; number: number; title: string; when: string; badge: string; tone: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-4 p-3 rounded-xl bg-ground border border-line hover:border-line-strong transition-all text-xs text-ink">
      <div className="min-w-0 space-y-1">
        <div className="font-[500] line-clamp-2"><span className="text-ink-soft mr-1.5 font-mono">#{number}</span>{title}</div>
        <div className="text-[10px] text-ink-soft">{when}</div>
      </div>
      <span className={`px-2 py-0.5 rounded text-[9px] font-[650] uppercase border shrink-0 ${tone}`}>{badge}</span>
    </a>
  );
}

/**
 * What a maintainer did in THIS repository during the selected period: the
 * pull requests they merged (as merger), the ones they opened, the issues
 * they raised, and the days they tend to be around. Nothing from other
 * repositories: someone looking up a maintainer wants to know how to work
 * with them here.
 */
export function MaintainerPanel({ contributor: c, events, repoUrl, since, until, mergesKnown }: {
  contributor: PanelContributor;
  events: MaintainerEvent[];
  repoUrl: string;
  since: string;
  until: string;
  mergesKnown: boolean;
}) {
  const mine = useMemo(() => events.filter((e) => e.who.toLowerCase() === c.username.toLowerCase()), [events, c.username]);
  const merges = useMemo(() => mine.filter((e) => e.kind === 'merged').sort((a, b) => b.t.localeCompare(a.t)), [mine]);
  const heat = useMemo(() => buildHeatmap(mine, new Date(since), new Date(until)), [mine, since, until]);
  const lastActive = mine.length ? mine.reduce((m, e) => (e.t > m ? e.t : m), mine[0].t) : null;
  const opened = [...c.prs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const weekend = Math.round(heat.weekendShare * 100);

  const pattern = heat.total === 0
    ? null
    : `Most active on ${list(heat.busiest.map((i) => WEEKDAY_LONG[i]))}${heat.busiest.length > 1 ? 's' : ''}; ${weekend === 0 ? 'nothing at weekends' : `${weekend}% at weekends`}. Last seen ${lastActive ? dateShort(lastActive) : ''}.`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tile label={mergesKnown ? 'PRs they merged' : 'PRs they merged (needs token)'} value={merges.length} tone="text-success-600" />
        <Tile label="PRs they opened" value={c.prsCount} />
        <Tile label="of those merged" value={c.mergedPRs} tone="text-success-600" />
        <Tile label="Issues they opened" value={c.issuesCount} tone="text-violet-600" />
      </div>
      {pattern && (
        <p className="text-xs text-ink-mid bg-success-0 border border-success-100 rounded-xl px-3.5 py-2.5">
          <span className="font-[650] text-success-600">When to reach them: </span>{pattern}
        </p>
      )}

      <div>
        <h4 className="text-xs font-[650] text-ink-mid uppercase tracking-wider mb-3">Merged by @{c.username} · {merges.length}</h4>
        {merges.length === 0 ? (
          <p className="text-sm text-ink-soft italic">{mergesKnown ? 'Merged nothing in this period.' : 'Merges cannot be attributed without a GitHub token.'}</p>
        ) : (
          <div className="space-y-2">
            {merges.slice(0, 40).map((e) => (
              <Row key={e.n} href={`${repoUrl}/pull/${e.n}`} number={e.n} title={e.title} when={`merged ${dateShort(e.t)}`} badge="merged" tone="bg-success-0 border-success-100 text-success-600" />
            ))}
            {merges.length > 40 && <p className="text-[11px] text-ink-faint">and {merges.length - 40} more</p>}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-[650] text-ink-mid uppercase tracking-wider mb-3">Opened by @{c.username} · {opened.length}</h4>
        {opened.length === 0 ? (
          <p className="text-sm text-ink-soft italic">Opened no pull request in this period.</p>
        ) : (
          <div className="space-y-2">
            {opened.map((pr) => (
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
      </div>

      {c.issues.length > 0 && (
        <div>
          <h4 className="text-xs font-[650] text-ink-mid uppercase tracking-wider mb-3">Issues opened · {c.issues.length}</h4>
          <div className="space-y-2">
            {c.issues.map((i) => (
              <Row key={i.number} href={i.url} number={i.number} title={i.title} when={`opened ${dateShort(i.createdAt)}`} badge={i.state} tone={i.state === 'open' ? 'bg-brand-0 border-brand-100 text-brand-600' : 'bg-violet-0 border-violet-100 text-violet-600'} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
