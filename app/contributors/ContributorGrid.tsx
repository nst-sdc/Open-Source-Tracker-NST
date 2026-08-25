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

function PRBar({ merged, open, closed, total }: { merged: number; open: number; closed: number; total: number }) {
  if (total === 0) return <div className="w-full h-1.5 rounded-full bg-white/10" />;
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden flex">
      <div className="h-full bg-emerald-500" style={{ width: `${(merged / total) * 100}%` }} />
      <div className="h-full bg-teal-400" style={{ width: `${(open / total) * 100}%` }} />
      <div className="h-full bg-red-500/60" style={{ width: `${(closed / total) * 100}%` }} />
    </div>
  );
}

function ContributorCard({
  summary,
  period,
  from,
  to,
}: {
  summary: StudentSummary;
  period: string;
  from?: string;
  to?: string;
}) {
  return (
    <Link
      key={summary.profile.login}
      href={`/contributors/${summary.profile.login}?period=${period}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
      className="group relative bg-white/[0.025] border border-white/[0.07] rounded-2xl p-6 sys-card-hover"
    >
      <div className="flex items-start gap-4 mb-5">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <Image
            src={summary.profile.avatar_url}
            alt={summary.profile.login}
            width={52}
            height={52}
            unoptimized
            className="w-[52px] h-[52px] rounded-full ring-2 ring-white/10 group-hover:ring-purple-500/40 transition-all object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-white/90 group-hover:text-white truncate transition-colors">
              {summary.profile.name ?? summary.profile.login}
            </h3>
            <span
              title="Ranking score for this contributor"
              className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 tabular-nums"
            >
              {summary.scoreMergedPRs.toFixed(1)}
            </span>
          </div>
          <p className="text-white/35 text-xs mt-0.5 truncate">@{summary.profile.login}</p>
          {(summary.year || summary.campus) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {summary.year && (
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                  {summary.year}
                </span>
              )}
              {summary.campus && (
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                  {summary.campus}
                </span>
              )}
            </div>
          )}
          <p className="text-white/40 text-sm mt-2">
            {summary.totalPRs} contribution{summary.totalPRs !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          {summary.mergedPRs} merged
        </span>
        {summary.openPRs > 0 && (
          <span className="flex items-center gap-1.5 text-teal-400">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
            {summary.openPRs} open
          </span>
        )}
        {summary.closedPRs > 0 && (
          <span className="flex items-center gap-1.5 text-red-400/60">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400/60 flex-shrink-0" />
            {summary.closedPRs} closed
          </span>
        )}
        {(summary.issuesCount ?? 0) > 0 && (
          <span className="flex items-center gap-1.5 text-purple-400">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
            {summary.issuesCount} issue{summary.issuesCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <PRBar
        merged={summary.mergedPRs}
        open={summary.openPRs}
        closed={summary.closedPRs}
        total={summary.totalPRs}
      />

      <div className="mt-4 flex items-center justify-between">
        <span className="text-white/20 text-xs group-hover:text-white/40 transition-colors">
          View all contributions
        </span>
        <svg
          className="w-4 h-4 text-white/15 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
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
    <div className="max-w-6xl mx-auto px-4 pb-24 space-y-14">
      {/* Section 1: Active Contributors */}
      <div>
        <h2 className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-6 flex items-center gap-2">
          <span>👥 Active Contributors</span>
          <span className="bg-purple-500/10 text-purple-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
            {realContributors.length}
          </span>
        </h2>
        {activePage.length > 0 ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePage.map((summary) => (
                <ContributorCard
                  key={summary.profile.login}
                  summary={summary}
                  period={period}
                  from={from}
                  to={to}
                />
              ))}
            </div>
            {realContributors.length > visibleActiveCount && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setVisibleActiveCount((c) => c + 50)}
                  className="px-6 py-2.5 rounded-xl text-sm font-medium border border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.12] transition-all animate-fade-in"
                >
                  Load More Active Contributors
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-10 text-white/25 text-sm bg-white/[0.01] border border-white/[0.04] rounded-2xl">
            No active contributors found matching the filters.
          </div>
        )}
      </div>

      {/* Section 2: Other Registered Members */}
      <div>
        <h2 className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-6 flex items-center gap-2">
          <span>🎓 Other Registered Members</span>
          <span className="bg-white/5 text-white/35 text-[10px] px-2 py-0.5 rounded-full font-bold">
            {otherStudents.length}
          </span>
        </h2>
        {otherPage.length > 0 ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherPage.map((summary) => (
                <ContributorCard
                  key={summary.profile.login}
                  summary={summary}
                  period={period}
                  from={from}
                  to={to}
                />
              ))}
            </div>
            {otherStudents.length > visibleOtherCount && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setVisibleOtherCount((c) => c + 50)}
                  className="px-6 py-2.5 rounded-xl text-sm font-medium border border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.12] transition-all animate-fade-in"
                >
                  Load More Members
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-10 text-white/25 text-sm bg-white/[0.01] border border-white/[0.04] rounded-2xl">
            No other registered members found matching the filters.
          </div>
        )}
      </div>
    </div>
  );
}
