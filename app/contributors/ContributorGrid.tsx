'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { StudentSummary } from '@/lib/github';

interface GridProps {
  realContributors: StudentSummary[];
  otherStudents: StudentSummary[];
  period: string;
  from?: string;
  to?: string;
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.5 7.5 6 10.5 12 4l6 6.5 3.5-3v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9Z" />
    </svg>
  );
}

function MergeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}

function RankCell({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 bg-gold-400 text-ink rounded-full px-2.5 py-1 text-[12px] font-[650] tabular-nums">
        <CrownIcon className="w-3 h-3" />{rank}
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 bg-panel-2 text-ink-mid rounded-full px-2.5 py-1 text-[12px] font-[650] tabular-nums">
        <CrownIcon className="w-3 h-3" />{rank}
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 bg-warning-200 text-warning-800 rounded-full px-2.5 py-1 text-[12px] font-[650] tabular-nums">
        <CrownIcon className="w-3 h-3" />{rank}
      </span>
    );
  }
  return <span className="text-[14px] font-[650] text-ink-soft tabular-nums pl-2">{rank}</span>;
}

const ROW_GRID =
  'grid grid-cols-[64px_minmax(0,1fr)_72px_44px] md:grid-cols-[76px_minmax(0,1fr)_120px_92px_80px_72px_76px_36px] gap-3 items-center';

function ContributorRow({
  summary,
  rank,
  period,
  from,
  to,
}: {
  summary: StudentSummary;
  rank: number;
  period: string;
  from?: string;
  to?: string;
}) {
  const highlight = rank === 1 ? 'bg-gold-0/40' : '';
  return (
    <Link
      href={`/contributors/${summary.profile.login}?period=${period}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
      className={`${ROW_GRID} px-4 md:px-5 py-3 border-t border-panel hover:bg-panel/60 transition-colors group ${highlight}`}
    >
      <span><RankCell rank={rank} /></span>

      <span className="flex items-center gap-3 min-w-0">
        <Image
          src={summary.profile.avatar_url}
          alt=""
          width={38}
          height={38}
          unoptimized
          className="w-[38px] h-[38px] rounded-full border border-line object-cover shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-[550] text-ink truncate group-hover:text-brand-600 transition-colors">
            {summary.profile.name ?? summary.profile.login}
          </span>
          <span className="block text-[12px] text-ink-soft truncate">@{summary.profile.login}</span>
        </span>
        <span className="flex flex-col items-end gap-0.5 shrink-0">
          <span title="Ranking score for this contributor" className="text-[11px] font-[650] text-gold-600 bg-gold-0 rounded-md px-1.5 py-0.5 tabular-nums">
            {summary.scoreMergedPRs.toFixed(1)}
          </span>
          {summary.avgScore !== undefined && (
            <span
              title="Average impact per merged PR — how significant the projects they contribute to tend to be, not how many PRs they've done. See each PR's own Impact score on their profile."
              className="text-[9.5px] text-ink-soft tabular-nums"
            >
              impact {summary.avgScore.toFixed(1)}
            </span>
          )}
        </span>
      </span>

      <span className="hidden md:block text-[13px] text-ink-mid truncate">
        {summary.campus ?? <span className="text-ink-faint">—</span>}
      </span>
      <span className="hidden md:block text-[13px] text-ink-mid truncate">
        {summary.year ?? <span className="text-ink-faint">—</span>}
      </span>

      <span className="flex items-center gap-1.5 justify-end">
        <MergeIcon className="w-3.5 h-3.5 text-success-600 shrink-0" />
        <span className="text-[14.5px] font-[650] text-success-600 tabular-nums">{summary.mergedPRs}</span>
      </span>
      <span className="hidden md:block text-[14px] text-ink-mid tabular-nums text-right">{summary.openPRs}</span>
      <span className="hidden md:block text-[14px] text-ink-mid tabular-nums text-right">{summary.issuesCount ?? 0}</span>

      <span className="hidden md:flex justify-end">
        <svg className="w-4 h-4 text-ink-faint group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      </span>
    </Link>
  );
}

export function ContributorGrid({
  realContributors,
  otherStudents,
  period,
  from,
  to,
}: GridProps) {
  const [visibleActiveCount, setVisibleActiveCount] = useState(50);
  const [visibleOtherCount, setVisibleOtherCount] = useState(50);

  const activePage = realContributors.slice(0, visibleActiveCount);
  const otherPage = otherStudents.slice(0, visibleOtherCount);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 pb-20 mt-6 space-y-10">
      {/* Ranked leaderboard table */}
      <div className="bg-white border border-line rounded-2xl shadow-card overflow-hidden">
        <div className={`${ROW_GRID} px-4 md:px-5 py-3.5 bg-panel`}>
          <span className="text-[11px] font-[650] text-ink-soft tracking-[0.08em]">RANK</span>
          <span className="text-[11px] font-[650] text-ink-soft tracking-[0.08em]">NAME</span>
          <span className="hidden md:block text-[11px] font-[650] text-ink-soft tracking-[0.08em]">CAMPUS</span>
          <span className="hidden md:block text-[11px] font-[650] text-ink-soft tracking-[0.08em]">YEAR</span>
          <span className="text-[11px] font-[650] text-ink-soft tracking-[0.08em] text-right">MERGED</span>
          <span className="hidden md:block text-[11px] font-[650] text-ink-soft tracking-[0.08em] text-right">OPEN</span>
          <span className="hidden md:block text-[11px] font-[650] text-ink-soft tracking-[0.08em] text-right">ISSUES</span>
          <span className="hidden md:block" />
        </div>

        {activePage.length > 0 ? (
          activePage.map((summary, i) => (
            <ContributorRow
              key={summary.profile.login}
              summary={summary}
              rank={i + 1}
              period={period}
              from={from}
              to={to}
            />
          ))
        ) : (
          <div className="flex flex-col items-center gap-2 py-14 px-6 text-center">
            <span className="w-11 h-11 rounded-xl bg-panel text-ink-faint flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <p className="text-ink text-sm font-[550]">No contributors match these filters</p>
            <p className="text-ink-soft text-[13px]">Try a wider time period, or clear the search.</p>
          </div>
        )}

        {realContributors.length > visibleActiveCount && (
          <div className="flex items-center justify-center gap-3 py-4 border-t border-panel">
            <span className="text-[12.5px] text-ink-soft">
              Showing {activePage.length} of {realContributors.length}
            </span>
            <button
              onClick={() => setVisibleActiveCount((c) => c + 50)}
              className="h-9 px-4 rounded-[10px] text-[13px] font-[550] border border-line-strong bg-white text-ink hover:bg-panel transition-colors"
            >
              Load more
            </button>
          </div>
        )}
      </div>

      {/* Other registered members */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <h2 className="text-[15px] font-[650] text-ink">Registered, not contributing yet</h2>
          <span className="bg-panel-2 text-ink-mid text-[11.5px] px-2 py-0.5 rounded-full font-[650] tabular-nums">
            {otherStudents.length}
          </span>
        </div>

        {otherPage.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {otherPage.map((summary) => (
                <Link
                  key={summary.profile.login}
                  href={`/contributors/${summary.profile.login}?period=${period}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
                  className="flex items-center gap-3 bg-white border border-line rounded-xl px-4 py-3 card-hover group"
                >
                  <Image
                    src={summary.profile.avatar_url}
                    alt=""
                    width={34}
                    height={34}
                    unoptimized
                    className="w-[34px] h-[34px] rounded-full border border-line object-cover shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-[550] text-ink truncate group-hover:text-brand-600 transition-colors">
                      {summary.profile.name ?? summary.profile.login}
                    </span>
                    <span className="block text-[11.5px] text-ink-soft truncate">
                      @{summary.profile.login}
                      {summary.campus ? ` · ${summary.campus}` : ''}
                    </span>
                  </span>
                  <svg className="w-3.5 h-3.5 text-ink-faint group-hover:text-brand-600 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
            {otherStudents.length > visibleOtherCount && (
              <div className="flex justify-center">
                <button
                  onClick={() => setVisibleOtherCount((c) => c + 50)}
                  className="h-9 px-4 rounded-[10px] text-[13px] font-[550] border border-line-strong bg-white text-ink hover:bg-panel transition-colors"
                >
                  Load more members
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-ink-soft text-sm bg-white border border-line rounded-2xl">
            No other registered members match the filters.
          </div>
        )}
      </div>
    </div>
  );
}
