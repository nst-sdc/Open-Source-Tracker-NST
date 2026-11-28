import { buildLeaderboard, parseLeaderboardQuery, PAGE_SIZE, type LeaderboardRow } from "@/lib/leaderboard";
import { getRecognitions } from "@/lib/recognitions";
import { readCommunityTimeline, chartRanges, averagesFor } from "@/lib/community-timeline";
import { impactOutOf10, prValueOutOf10, outOf10 } from "@/lib/display-scale";
import { CommunityChart } from "../components/CommunityChart";
import { FilterBar } from "./FilterBar";
import { ContributorGrid } from "./ContributorGrid";
import { BootstrapBanner } from "./BootstrapBanner";
import { isLocalAutoRefreshEnabled } from "@/lib/local-auto-refresh";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";

// Dynamic so router.refresh() re-renders with updated cache
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contributors — Opensource Tracker",
  description: "Student open source contributions",
};

/** A summary plus its position on the full leaderboard for the selected
 *  period. Carried through filtering so the number never depends on what is
 *  currently on screen. */

const PERIOD_KICKERS: Record<string, string> = {
  all: "ALL TIME",
  "1day": "LAST 24 HOURS",
  week: "LAST 7 DAYS",
  month: "LAST 30 DAYS",
  "2months": "LAST 2 MONTHS",
  "3months": "LAST 3 MONTHS",
  "6months": "LAST 6 MONTHS",
  year: "LAST YEAR",
  custom: "CUSTOM RANGE",
};

function getMinutesAgo(cachedAt: string): number {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000),
  );
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2.5 7.5 6 10.5 12 4l6 6.5 3.5-3v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9Z" />
    </svg>
  );
}

function MergeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}

function PodiumCard({
  summary,
  rank,
  period,
  from,
  to,
  org,
}: {
  summary: LeaderboardRow;
  rank: 1 | 2 | 3;
  period: string;
  from?: string;
  to?: string;
  /** Carried into the profile link so an org view survives the click. */
  org?: string;
}) {
  const isFirst = rank === 1;
  const isSecond = rank === 2;

  const rankBadge = isFirst ? (
    <span className="inline-flex items-center gap-1.5 bg-gold-400 text-ink-on-accent rounded-full px-3 py-1 text-[12px] font-[650] tabular-nums shadow-sm">
      <CrownIcon className="w-3.5 h-3.5" /> 1st Place
    </span>
  ) : isSecond ? (
    <span className="inline-flex items-center gap-1.5 bg-panel-2 text-ink-strong border border-line-strong rounded-full px-3 py-1 text-[12px] font-[650] tabular-nums shadow-sm">
      <CrownIcon className="w-3.5 h-3.5 text-ink-soft" /> 2nd Place
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 bg-warning-0 text-warning-800 border border-warning-200 rounded-full px-3 py-1 text-[12px] font-[650] tabular-nums shadow-sm">
      <CrownIcon className="w-3.5 h-3.5 text-warning-600" /> 3rd Place
    </span>
  );

  const cardStyle = isFirst
    ? "bg-gradient-to-b from-gold-0/70 via-ground to-ground border-2 border-gold-400/70 shadow-pop md:-translate-y-2 relative hover:-translate-y-1 md:hover:-translate-y-3"
    : isSecond
      ? "bg-gradient-to-b from-panel-2/90 via-ground to-ground border border-line-strong hover:border-line-heavy shadow-card hover:-translate-y-1"
      : "bg-gradient-to-b from-warning-0/80 via-ground to-ground border border-warning-200 hover:border-warning-400 shadow-card hover:-translate-y-1";

  const avatarRing = isFirst
    ? "ring-4 ring-gold-100 border-2 border-gold-500"
    : isSecond
      ? "ring-4 ring-line border-2 border-line-heavy"
      : "ring-4 ring-warning-0 border-2 border-warning-400";

  const avatarSize = isFirst ? 80 : 64;

  return (
    <Link
      href={`/contributors/${summary.login}?period=${period}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}${org ? `&org=${encodeURIComponent(org)}` : ""}`}
      className={`group flex flex-col items-center text-center rounded-2xl p-5 md:p-6 transition-[translate,box-shadow,border-color] duration-300 ease-out motion-reduce:transition-none hover:shadow-card-hover ${cardStyle}`}
    >
      <div className="mb-4">{rankBadge}</div>

      <div className="relative">
        <Image
          src={summary.avatarUrl}
          alt={summary.login}
          width={avatarSize}
          height={avatarSize}
          unoptimized
          className={`rounded-full object-cover ${avatarRing} ${isFirst ? "w-20 h-20" : "w-16 h-16"}`}
        />
        {isFirst && (
          <span
            className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-gold-400 text-ink-on-accent rounded-full flex items-center justify-center text-[11px] font-[700] tabular-nums shadow-sm"
            aria-hidden="true"
          >
            1
          </span>
        )}
      </div>

      <div className="mt-3.5 w-full min-w-0">
        <h3
          className={`font-[650] text-ink truncate group-hover:text-brand-600 transition-colors ${isFirst ? "text-[16.5px]" : "text-[15px]"}`}
        >
          {summary.name ?? summary.login}
        </h3>
        <p className="text-[12.5px] text-ink-soft truncate mt-0.5 font-[450]">
          @{summary.login}
        </p>
      </div>

      {(summary.year || summary.campus) && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
          {summary.year && (
            <span className="text-[11px] font-[550] px-2 py-0.5 rounded-md bg-panel border border-line text-ink-mid">
              {summary.year}
            </span>
          )}
          {summary.campus && (
            <span className="text-[11px] font-[550] px-2 py-0.5 rounded-md bg-brand-0 text-brand-600 border border-brand-100">
              {summary.campus}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 pt-3.5 border-t border-line w-full grid grid-cols-2 gap-2 text-center">
        <div className="flex flex-col items-center">
          <span className="text-[11px] font-[550] text-ink-soft uppercase tracking-wider">
            Merged
          </span>
          <span className="inline-flex items-center gap-1 text-[14px] font-[650] text-success-600 tabular-nums mt-0.5">
            <MergeIcon className="w-3.5 h-3.5" />
            {summary.mergedPRs}
          </span>
        </div>
        <div className="flex flex-col items-center border-l border-line">
          <span className="text-[11px] font-[550] text-ink-soft uppercase tracking-wider">
            Rating
          </span>
          <span className="text-[14px] font-[650] text-gold-600 tabular-nums mt-0.5">
            {summary.scoreMergedPRs.toFixed(1)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function ContributorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    search?: string;
    org?: string;
    year?: string;
    campus?: string;
  }>;
}) {
  const raw = await searchParams;
  const query = parseLeaderboardQuery(raw);
  const { period, from, to, search, year, campus } = query;
  const [board, recognitions, timeline] = await Promise.all([buildLeaderboard(query), getRecognitions(), readCommunityTimeline()]);

  if (board.rosterEmpty) {
    return (
      <main className="min-h-screen bg-panel flex items-center justify-center px-4">
        <div className="text-center max-w-md bg-ground border border-line rounded-2xl shadow-card p-8">
          <span className="w-12 h-12 rounded-xl bg-brand-0 text-brand-600 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <h1 className="text-xl font-[650] text-ink mb-2">
            No students added yet
          </h1>
          <p className="text-ink-soft text-sm mb-5">
            Add GitHub usernames to{" "}
            <code className="bg-panel px-1.5 py-0.5 rounded-md text-brand-600 text-[13px]">
              data/students.json
            </code>
          </p>
          <pre className="bg-panel border border-line rounded-xl p-4 text-left text-[13px] text-ink-mid overflow-x-auto">
            {`[\n  "github-username-1",\n  "github-username-2"\n]`}
          </pre>
        </div>
      </main>
    );
  }

  const isOrgSearch = board.org !== null;
  const matchedOrg = board.org;
  const { podium, totals, cachedAt } = board;
  const kicker = PERIOD_KICKERS[period] ?? "ALL TIME";

  const refreshedAgo = cachedAt ? getMinutesAgo(cachedAt) : null;

  // Average project impact and effort per merged PR for the campus/year in
  // view, all time, from the same timeline the chart draws.
  const quality = averagesFor(timeline, { campus, year });

  return (
    <main className="min-h-screen bg-panel pb-20">
      {/* Contest hero */}
      <div className="bg-ground border-b border-line">
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-8 pb-12">
          {/* Top metadata strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 bg-panel border border-line rounded-full px-3.5 py-1.5 text-[12.5px] font-[550] text-ink-mid">
              <span className="live-dot w-[7px] h-[7px] rounded-full bg-success-400" />
              <span>{kicker.charAt(0) + kicker.slice(1).toLowerCase()}</span>
              {refreshedAgo !== null && (
                <span className="text-ink-soft hidden sm:inline">
                  · Refreshed{" "}
                  {refreshedAgo === 0 ? "just now" : `${refreshedAgo} min ago`}
                </span>
              )}
            </span>
            <Link
              href="/documentation#ranking"
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[9px] bg-panel border border-line-strong hover:bg-panel-2 text-ink text-[13px] font-[550] transition-colors"
            >
              <span>How ranking works</span>
              <span className="text-ink-soft" aria-hidden="true">
                →
              </span>
            </Link>
          </div>

          {/* Heading */}
          <div className="text-center max-w-2xl mx-auto mt-6 mb-10">
            <div className="inline-flex items-center gap-1.5 text-[11.5px] font-[650] text-brand-600 bg-brand-0 px-3 py-1 rounded-full tracking-[0.06em] uppercase mb-3">
              <CrownIcon className="w-3.5 h-3.5 text-gold-500" />
              Open Source Leaderboard
            </div>
            <h1 className="text-[34px] md:text-[44px] font-[650] leading-[1.12] tracking-[-0.02em] text-ink">
              Top Contributors
            </h1>
            <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft max-w-lg mx-auto">
              Real pull requests and issues from NST students — filtered for
              spam, verified by merge status, and ranked transparently.
            </p>
          </div>

          {/* Podium (Top 3) */}
          {podium.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 max-w-4xl mx-auto items-end pt-2">
              {/* 2nd Place (Left on desktop) */}
              {podium.length > 1 ? (
                <div className="order-2 md:order-1">
                  <PodiumCard
                    summary={podium[1]}
                    rank={2}
                    period={period}
                    from={from}
                    to={to}
                    org={matchedOrg?.login}
                  />
                </div>
              ) : (
                <div className="order-2 md:order-1 hidden md:block" />
              )}

              {/* 1st Place (Center) */}
              <div className="order-1 md:order-2">
                <PodiumCard
                  summary={podium[0]}
                  rank={1}
                  period={period}
                  from={from}
                  to={to}
                    org={matchedOrg?.login}
                />
              </div>

              {/* 3rd Place (Right on desktop) */}
              {podium.length > 2 ? (
                <div className="order-3">
                  <PodiumCard
                    summary={podium[2]}
                    rank={3}
                    period={period}
                    from={from}
                    to={to}
                    org={matchedOrg?.login}
                  />
                </div>
              ) : (
                <div className="order-3 hidden md:block" />
              )}
            </div>
          ) : !isOrgSearch && !search && !year && !campus ? (
            <div className="bg-panel border border-line rounded-2xl p-8 text-center max-w-md mx-auto">
              <p className="text-ink-soft text-sm">
                No contributions found for this filter yet.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* CTA Banner (only shown in normal view) */}
      {!isOrgSearch && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
          <div className="bg-gradient-to-r from-brand-0/70 via-ground to-violet-0/60 border border-brand-100 rounded-2xl shadow-card p-5 md:p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[260px]">
              <h2 className="text-ink text-[16px] md:text-[17px] font-[650]">
                Get PRs merged to climb the leaderboard!
              </h2>
              <p className="text-ink-soft text-[13px] mt-1">
                Real contributions only — spam and self-merges are automatically
                filtered out.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/issues"
                className="flex items-center h-[38px] px-4 rounded-[9px] bg-brand-solid hover:bg-brand-solid-hover text-white text-[13.5px] font-[550] shadow-brand-btn transition-colors"
              >
                Find an issue
              </Link>
              <Link
                href="/check-work"
                className="flex items-center h-[38px] px-4 rounded-[9px] bg-ground border border-line-strong hover:bg-panel text-ink text-[13.5px] font-[550] transition-colors"
              >
                Check my work
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Summary strip (only shown in normal view) */}
      {!isOrgSearch && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
          <div className={`bg-ground border border-line rounded-2xl shadow-card grid grid-cols-2 ${quality.impact !== null ? "md:grid-cols-3 lg:grid-cols-6" : "md:grid-cols-4"}`}>
            {[
              {
                label: "Students",
                value: totals.students,
                num: "text-ink",
                sub:
                  totals.studentsInFilter !== totals.students
                    ? `${totals.studentsInFilter.toLocaleString("en-IN")} in this filter`
                    : undefined,
              },
              {
                label: "Contributors",
                value: totals.contributors,
                num: "text-brand-600",
              },
              {
                label: "Pull requests",
                value: totals.totalPRs,
                num: "text-ink",
              },
              {
                label: "Merged PRs",
                value: totals.totalMerged,
                num: "text-success-600",
              },
              ...(quality.impact !== null
                ? [{ label: "Avg impact · of 10", value: quality.impact, text: outOf10(impactOutOf10(quality.impact)), num: "text-ink", title: "Average project impact per merged PR: how significant the projects are, from the repo multiplier" }]
                : []),
              ...(quality.effort !== null
                ? [{ label: "Avg effort · of 10", value: quality.effort, text: outOf10(prValueOutOf10(quality.effort)), num: "text-ink", title: "Average effort per measured merged PR: what the change itself did; a typical twenty-line code change is a 5" }]
                : []),
            ].map((s, i) => (
              <div
                key={s.label}
                title={"title" in s ? s.title : undefined}
                className={`px-5 py-4 ${i > 0 ? "border-l border-line" : ""} ${i >= 2 ? "max-md:border-t max-md:border-line" : ""} ${i % 2 === 0 ? "max-md:border-l-0" : ""} ${quality.impact !== null ? `${i >= 3 ? "md:max-lg:border-t md:max-lg:border-line" : ""} ${i % 3 === 0 ? "md:max-lg:border-l-0" : ""}` : ""}`}
              >
                <div
                  className={`text-[22px] leading-none font-[650] tabular-nums ${s.num}`}
                >
                  {"text" in s ? s.text : s.value.toLocaleString("en-IN")}
                </div>
                <div className="text-[12px] text-ink-soft mt-1">{s.label}</div>
                {"sub" in s && s.sub && (
                  <div className="text-[11px] text-ink-soft/80 mt-0.5 tabular-nums">{s.sub}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar with integrated organization context */}
      {isLocalAutoRefreshEnabled() && (
        <BootstrapBanner
          // A fetched profile carries GitHub's numeric avatar URL (/u/<id>);
          // the zero-PR placeholder for a not-yet-fetched student does not.
          populated={board.bootstrap.populated}
          total={board.bootstrap.total}
        />
      )}
      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBar
          orgContext={
            isOrgSearch && matchedOrg
              ? {
                  name: matchedOrg.name || matchedOrg.login,
                  login: matchedOrg.login,
                  avatarUrl: matchedOrg.avatarUrl,
                  contributorsCount: totals.contributors,
                  mergedPRs: totals.totalMerged,
                }
              : undefined
          }
        />
      </Suspense>

      {/* Activity by month: the whole community for the campus/year in view,
          or, in org mode, this organisation alone (who is active there, and
          how many), built from the same profiles the org view opens. */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
        <CommunityChart
          ranges={chartRanges(isOrgSearch && board.orgTimeline ? board.orgTimeline : timeline, { campus, year })}
          scopeLabel={[isOrgSearch && board.org ? board.org.name : null, campus, year].filter(Boolean).join(" · ") || undefined}
        />
      </div>
      {/* Ranked table + other members */}
      {/* Keyed by the filters: the grid keeps the pages it has loaded in
          client state, so a filter change must give it a fresh instance or it
          would keep showing the previous filter's rows. */}
      <ContributorGrid
        key={JSON.stringify(query)}
        recognitions={recognitions}
        active={board.active.slice(0, PAGE_SIZE)}
        activeTotal={board.active.length}
        other={board.other.slice(0, PAGE_SIZE)}
        otherTotal={board.other.length}
        query={query}
        period={period}
        periodLabel={kicker.toLowerCase()}
        from={from}
        to={to}
        orgContext={
          isOrgSearch && matchedOrg
            ? {
                name: matchedOrg.name || matchedOrg.login,
                login: matchedOrg.login,
              }
            : undefined
        }
      />
    </main>
  );
}

function FilterBarSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
      <div className="bg-ground border border-line rounded-2xl shadow-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="h-10 bg-panel rounded-[11px] flex-1 min-w-[200px] animate-pulse" />
          <div className="h-10 bg-panel rounded-[11px] w-32 animate-pulse" />
          <div className="h-10 bg-panel rounded-[11px] w-36 animate-pulse" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-9 bg-panel rounded-full w-20 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
