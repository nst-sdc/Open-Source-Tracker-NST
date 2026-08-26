import { getAllStudentSummaries, buildDateQuery, StudentSummary } from '@/lib/github';
import { getStudentsKV } from '@/lib/kv-students';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import { readSummaryCache, writeSummaryCache } from '@/lib/summary-cache';
import { FilterBar } from './FilterBar';
import { ContributorGrid } from './ContributorGrid';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';

// Dynamic so router.refresh() re-renders with updated cache
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Contributors — Opensource Tracker',
  description: 'Student open source contributions',
};

const PERIOD_KICKERS: Record<string, string> = {
  all: 'ALL TIME',
  '1day': 'LAST 24 HOURS',
  week: 'LAST 7 DAYS',
  month: 'LAST 30 DAYS',
  '2months': 'LAST 2 MONTHS',
  '3months': 'LAST 3 MONTHS',
  '6months': 'LAST 6 MONTHS',
  year: 'LAST YEAR',
  custom: 'CUSTOM RANGE',
};

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

function PodiumFigure({
  summary,
  rank,
  period,
  from,
  to,
}: {
  summary: StudentSummary;
  rank: 1 | 2 | 3;
  period: string;
  from?: string;
  to?: string;
}) {
  const center = rank === 1;
  const chip =
    rank === 1 ? 'bg-gold-400 text-ink' :
    rank === 2 ? 'bg-panel-2 text-ink-mid' :
    'bg-warning-200 text-warning-800';

  return (
    <Link
      href={`/contributors/${summary.profile.login}?period=${period}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
      className={`flex flex-col items-center group ${center ? '' : 'pt-7'}`}
    >
      <Image
        src={summary.profile.avatar_url}
        alt={summary.profile.login}
        width={center ? 96 : 72}
        height={center ? 96 : 72}
        unoptimized
        className={`rounded-full border-[3px] border-white object-cover shadow-pop ${center ? 'w-24 h-24' : 'w-[72px] h-[72px]'}`}
      />
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 -mt-3 text-[12.5px] font-[650] tabular-nums shadow-card ${chip}`}>
        <CrownIcon className="w-3 h-3" />{rank}
      </span>
      <span className={`mt-2.5 font-[650] text-white text-center max-w-[160px] truncate group-hover:underline underline-offset-4 ${center ? 'text-[16.5px]' : 'text-[14.5px]'}`}>
        {summary.profile.name ?? summary.profile.login}
      </span>
      <span className="mt-0.5 text-xs text-violet-200 max-w-[160px] truncate">@{summary.profile.login}</span>
      <span className="mt-2.5 inline-flex items-center gap-1.5 bg-white/12 rounded-full px-3 py-1">
        <MergeIcon className="w-3.5 h-3.5 text-success-200" />
        <span className="text-[13px] font-[650] text-white tabular-nums">{summary.mergedPRs} merged</span>
      </span>
    </Link>
  );
}

export default async function ContributorsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; search?: string; year?: string; campus?: string }>;
}) {
  const { period = 'all', from, to, search = '', year = '', campus = '' } = await searchParams;
  const dateQuery = buildDateQuery(period, from, to);
  const students = await getStudentsKV();

  if (students.length === 0) {
    return (
      <main className="min-h-screen bg-panel flex items-center justify-center px-4">
        <div className="text-center max-w-md bg-white border border-line rounded-2xl shadow-card p-8">
          <span className="w-12 h-12 rounded-xl bg-brand-0 text-brand-600 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <h1 className="text-xl font-[650] text-ink mb-2">No students added yet</h1>
          <p className="text-ink-soft text-sm mb-5">
            Add GitHub usernames to{' '}
            <code className="bg-panel px-1.5 py-0.5 rounded-md text-brand-600 text-[13px]">data/students.json</code>
          </p>
          <pre className="bg-panel border border-line rounded-xl p-4 text-left text-[13px] text-ink-mid overflow-x-auto">
            {`[\n  "github-username-1",\n  "github-username-2"\n]`}
          </pre>
        </div>
      </main>
    );
  }

  const flaggedPRIds = await getFlaggedPRIdSet();

  // ── Cache-first data loading ──────────────────────────────────────────────
  // Cache predefined period summaries to avoid hitting GitHub API rate limits
  const isPredefinedPeriod = ['all', '1day', 'week', 'month', '2months', '3months', '6months', 'year'].includes(period);
  // Every period except 'all' has a rolling date boundary (created:>N days ago)
  // that moves every second regardless of whether any student's data changed.
  // The incremental cron only patches 'all'/'week'/'month', and even those only
  // for the 5 students it happens to touch each tick — a PR can sit in a cached
  // '1day'/'2months'/etc. summary looking "recent" for days after it's actually
  // aged out, because nothing else ever forces that boundary to be re-evaluated.
  // Time-boxing the cache age for these periods makes them self-correct instead
  // of relying on an admin action (flagging a PR) to ever invalidate them.
  const isTimeWindowed = isPredefinedPeriod && period !== 'all';
  const MAX_WINDOW_CACHE_AGE_MS = 60 * 60 * 1000; // 1 hour
  let allSummaries: StudentSummary[] | null = null;
  let cachedAt: string | null = null;

  if (isPredefinedPeriod) {
    const cache = await readSummaryCache(period);
    // Only use cache if it exists, hasn't been explicitly invalidated (epoch
    // timestamp), and — for time-windowed periods — isn't old enough that its
    // date boundary has drifted out of date.
    if (cache && cache.cachedAt !== '1970-01-01T00:00:00.000Z') {
      const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
      if (!isTimeWindowed || ageMs < MAX_WINDOW_CACHE_AGE_MS) {
        allSummaries = cache.summaries;
        cachedAt = cache.cachedAt;
      }
    }
  }

  if (!allSummaries) {
    try {
      // No cache, stale cache, or custom range — fetch live
      allSummaries = await getAllStudentSummaries(dateQuery, flaggedPRIds);
      if (isPredefinedPeriod) {
        await writeSummaryCache(allSummaries, period);
        cachedAt = new Date().toISOString();
      }
    } catch (err) {
      console.error('Failed to fetch student summaries from GitHub API:', err);
      if (isPredefinedPeriod) {
        const staleCache = await readSummaryCache(period);
        if (staleCache) {
          console.warn(`Falling back to stale summary cache for ${period} (cached at ${staleCache.cachedAt})`);
          allSummaries = staleCache.summaries;
          cachedAt = staleCache.cachedAt;
        }
      }
      if (!allSummaries) {
        allSummaries = [];
      }
    }
  } else {
    // Keep scores sorted in descending order
    allSummaries = [...allSummaries].sort((a, b) => b.scoreMergedPRs - a.scoreMergedPRs);
  }

  const summaries = allSummaries.filter((s) => {
    // Text search filter
    if (search) {
      const q = search.toLowerCase();
      const matchesText =
        s.profile.login.toLowerCase().includes(q) ||
        (s.profile.name ?? '').toLowerCase().includes(q) ||
        (s.year ?? '').toLowerCase().includes(q) ||
        (s.campus ?? '').toLowerCase().includes(q);
      if (!matchesText) return false;
    }
    // Year filter
    if (year && s.year !== year) return false;
    // Campus filter
    if (campus && s.campus !== campus) return false;
    return true;
  });
  const totalPRs = summaries.reduce((s, c) => s + c.totalPRs, 0);
  const totalMerged = summaries.reduce((s, c) => s + c.mergedPRs, 0);

  const realContributors = summaries.filter((s) => s.totalPRs > 0 || (s.issuesCount ?? 0) > 0);
  const otherStudents = summaries.filter((s) => !(s.totalPRs > 0 || (s.issuesCount ?? 0) > 0));
  const podium = realContributors.slice(0, 3);
  const kicker = PERIOD_KICKERS[period] ?? 'ALL TIME';

  const refreshedAgo = cachedAt
    ? Math.max(0, Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000))
    : null;

  return (
    <main className="min-h-screen bg-panel">
      {/* Contest hero */}
      <div className="bg-gradient-to-br from-violet-700 via-violet-800 to-violet-900 contest-grid">
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-8 pb-24">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 text-[12.5px] font-[550] text-white">
              {kicker.charAt(0) + kicker.slice(1).toLowerCase()}
              {refreshedAgo !== null && (
                <span className="text-violet-200 hidden sm:inline">· refreshed {refreshedAgo === 0 ? 'just now' : `${refreshedAgo} min ago`}</span>
              )}
            </span>
            <Link
              href="/get-started"
              className="flex items-center h-10 px-5 rounded-[10px] bg-white text-ink text-[13.5px] font-[650] hover:bg-brand-0 transition-colors"
            >
              How it works
            </Link>
          </div>

          <div className="flex flex-col items-center mt-2">
            <CrownIcon className="w-[22px] h-[22px] text-gold-400" />
            <div className="flex items-center gap-4 mt-1.5">
              <span className="w-12 md:w-14 h-px bg-white/35" />
              <span className="text-[11.5px] font-[650] text-violet-200 tracking-[0.18em]">OPEN SOURCE · {kicker}</span>
              <span className="w-12 md:w-14 h-px bg-white/35" />
            </div>
            <h1 className="mt-1.5 text-[38px] md:text-[46px] font-[650] tracking-[-0.01em] text-white [text-shadow:0_2px_12px_rgb(11_12_14_/_0.25)]">
              Leaderboard
            </h1>
          </div>

          {/* Podium */}
          {podium.length > 0 ? (
            <div className="flex items-start justify-center gap-8 md:gap-16 mt-7">
              {podium.length > 1 && <PodiumFigure summary={podium[1]} rank={2} period={period} from={from} to={to} />}
              <PodiumFigure summary={podium[0]} rank={1} period={period} from={from} to={to} />
              {podium.length > 2 && <PodiumFigure summary={podium[2]} rank={3} period={period} from={from} to={to} />}
            </div>
          ) : (
            <p className="text-center text-violet-200 text-sm mt-8">
              No contributions found for this filter yet.
            </p>
          )}
        </div>
      </div>

      {/* CTA band, overlapping the hero */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 -mt-12">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl shadow-violet-band px-6 py-5">
          <div className="flex-1 min-w-[240px]">
            <h2 className="text-white text-[16.5px] font-[650]">Get PRs merged to climb the leaderboard!</h2>
            <p className="text-violet-100 text-[13px] mt-0.5">
              Real contributions only — spam and self-merges are filtered out automatically.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/issues"
              className="flex items-center h-[42px] px-5 rounded-[10px] bg-white text-violet-700 text-[13.5px] font-[650] hover:bg-violet-0 transition-colors"
            >
              Find an issue
            </Link>
            <Link
              href="/check-work"
              className="flex items-center h-[42px] px-5 rounded-[10px] border-[1.5px] border-white/50 text-white text-[13.5px] font-[650] hover:bg-white/10 transition-colors"
            >
              Check my work
            </Link>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
        <div className="bg-white border border-line rounded-2xl shadow-card grid grid-cols-2 md:grid-cols-4">
          {[
            { label: 'Students', value: summaries.length, num: 'text-ink' },
            { label: 'Contributors', value: realContributors.length, num: 'text-ink' },
            { label: 'Pull requests', value: totalPRs, num: 'text-ink' },
            { label: 'Merged PRs', value: totalMerged, num: 'text-success-600' },
          ].map((s, i) => (
            <div key={s.label} className={`px-5 py-4 ${i > 0 ? 'border-l border-line' : ''} ${i >= 2 ? 'max-md:border-t max-md:border-line' : ''} ${i === 2 ? 'max-md:border-l-0' : ''}`}>
              <div className={`text-[22px] leading-none font-[650] tabular-nums ${s.num}`}>{s.value.toLocaleString('en-IN')}</div>
              <div className="text-[12px] text-ink-soft mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBar />
      </Suspense>

      {/* Ranked table + other members */}
      <ContributorGrid
        realContributors={realContributors}
        otherStudents={otherStudents}
        period={period}
        from={from}
        to={to}
      />
    </main>
  );
}

function FilterBarSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
      <div className="bg-white border border-line rounded-2xl shadow-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="h-10 bg-panel rounded-[11px] flex-1 min-w-[200px] animate-pulse" />
          <div className="h-10 bg-panel rounded-[11px] w-32 animate-pulse" />
          <div className="h-10 bg-panel rounded-[11px] w-36 animate-pulse" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 bg-panel rounded-full w-20 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
