import {
  getAllStudentSummaries,
  buildDateQuery,
  repoFromUrl,
  StudentSummary,
} from "@/lib/github";
import { getStudentsKV } from "@/lib/kv-students";
import { getFlaggedPRIdSet } from "@/lib/flagged";
import { readSummaryCache, writeSummaryCache } from "@/lib/summary-cache";
import { readProfileCache } from "@/lib/profile-cache";
import { getRepoCache } from "@/lib/repo-cache";
import {
  aggregateMergedPRScore,
  repoMultiplier,
  legacyMultiplier,
  NEUTRAL_MULTIPLIER,
  REPO_SCHEMA_VERSION,
} from "@/lib/repo-score";
import { resolveOrganization, OrgCacheEntry } from "@/lib/org-cache";
import { FilterBar } from "./FilterBar";
import { ContributorGrid } from "./ContributorGrid";
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
export type RankedSummary = StudentSummary & { rank: number };

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

function getCacheAgeMs(cachedAt: string): number {
  return Date.now() - new Date(cachedAt).getTime();
}

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
}: {
  summary: StudentSummary;
  rank: 1 | 2 | 3;
  period: string;
  from?: string;
  to?: string;
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
      href={`/contributors/${summary.profile.login}?period=${period}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
      className={`group flex flex-col items-center text-center rounded-2xl p-5 md:p-6 transition-[translate,box-shadow,border-color] duration-300 ease-out motion-reduce:transition-none hover:shadow-card-hover ${cardStyle}`}
    >
      <div className="mb-4">{rankBadge}</div>

      <div className="relative">
        <Image
          src={summary.profile.avatar_url}
          alt={summary.profile.login}
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
          {summary.profile.name ?? summary.profile.login}
        </h3>
        <p className="text-[12.5px] text-ink-soft truncate mt-0.5 font-[450]">
          @{summary.profile.login}
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
  const {
    period = "all",
    from,
    to,
    search = "",
    org = "",
    year = "",
    campus = "",
  } = await searchParams;
  const dateQuery = buildDateQuery(period, from, to);
  const students = await getStudentsKV();

  if (students.length === 0) {
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

  const flaggedPRIds = await getFlaggedPRIdSet();
  const repoCache = await getRepoCache();

  // ── Cache-first data loading ──────────────────────────────────────────────
  const isPredefinedPeriod = [
    "all",
    "1day",
    "week",
    "month",
    "2months",
    "3months",
    "6months",
    "year",
  ].includes(period);
  const isTimeWindowed = isPredefinedPeriod && period !== "all";
  const MAX_WINDOW_CACHE_AGE_MS = 60 * 60 * 1000; // 1 hour
  let allSummaries: StudentSummary[] | null = null;
  let cachedAt: string | null = null;

  if (isPredefinedPeriod) {
    const cache = await readSummaryCache(period);
    if (cache && cache.cachedAt !== "1970-01-01T00:00:00.000Z") {
      const ageMs = getCacheAgeMs(cache.cachedAt);
      if (!isTimeWindowed || ageMs < MAX_WINDOW_CACHE_AGE_MS) {
        allSummaries = cache.summaries;
        cachedAt = cache.cachedAt;
      }
    }
  }

  if (!allSummaries) {
    try {
      allSummaries = await getAllStudentSummaries(dateQuery, flaggedPRIds);
      if (isPredefinedPeriod) {
        await writeSummaryCache(allSummaries, period);
        cachedAt = new Date().toISOString();
      }
    } catch (err) {
      console.error("Failed to fetch student summaries from GitHub API:", err);
      if (isPredefinedPeriod) {
        const staleCache = await readSummaryCache(period);
        if (staleCache) {
          console.warn(
            `Falling back to stale summary cache for ${period} (cached at ${staleCache.cachedAt})`,
          );
          allSummaries = staleCache.summaries;
          cachedAt = staleCache.cachedAt;
        }
      }
      if (!allSummaries) {
        allSummaries = [];
      }
    }
  } else {
    allSummaries = [...allSummaries].sort(
      (a, b) => b.scoreMergedPRs - a.scoreMergedPRs,
    );
  }

  const hasActivity = (s: StudentSummary) =>
    s.totalPRs > 0 || (s.issuesCount ?? 0) > 0;

  // Global immutable leaderboard for the selected period
  const rankedLeaderboard: RankedSummary[] = allSummaries
    .filter(hasActivity)
    .map((summary, i) => ({ ...summary, rank: i + 1 }));

  // ── Organization Search Mode Activation ─────────────────────────────────
  // Organization mode is activated when an organization is explicitly selected (via org parameter).
  const cleanOrg = org.trim().replace(/^@/, "");
  let matchedOrg: OrgCacheEntry | null = null;
  if (cleanOrg) {
    matchedOrg = await resolveOrganization(cleanOrg);
  }

  const isOrgSearch = Boolean(matchedOrg && matchedOrg.isOrganization);

  let realContributors: RankedSummary[] = [];
  let otherStudents: StudentSummary[] = [];
  let totalPRs = 0;
  let totalMerged = 0;

  if (isOrgSearch && matchedOrg) {
    // ── Organization Search Mode ───────────────────────────────────────────
    const targetOrgLogin = matchedOrg.login.toLowerCase();
    const orgSummaries: StudentSummary[] = [];

    // Check student profile caches to discover all contributions to this org's public repos
    await Promise.all(
      allSummaries.map(async (studentSummary) => {
        try {
          const cached = await readProfileCache(studentSummary.profile.login);
          if (!cached || !cached.prs || cached.prs.length === 0) return;

          let prs = cached.prs;
          let issues = cached.issues || [];

          // Match any repository belonging to the organization
          prs = prs.filter((pr) => {
            if (!pr.repository_url) return false;
            const repo = repoFromUrl(pr.repository_url);
            return repo.split("/")[0]?.toLowerCase() === targetOrgLogin;
          });

          if (prs.length === 0) return;

          // Strip flagged / invalid contributions
          prs = prs.filter((pr) => {
            const repo = repoFromUrl(pr.repository_url);
            const key = `${repo}#${pr.number}`;
            if (flaggedPRIds.has(key)) return false;
            const repoEntry = repoCache[repo];
            if (repoEntry && repoEntry.valid === false) return false;
            return true;
          });

          // Filter by dateQuery if active
          if (dateQuery) {
            const gtMatch = dateQuery.match(/created:>([0-9-]{10})/);
            const rangeMatch = dateQuery.match(
              /created:([0-9-]{10})\.\.([0-9-]{10})/,
            );
            if (gtMatch) {
              const minDate = new Date(gtMatch[1]);
              prs = prs.filter((pr) => new Date(pr.created_at) > minDate);
              issues = issues.filter((is) => new Date(is.created_at) > minDate);
            } else if (rangeMatch) {
              const minDate = new Date(rangeMatch[1]);
              const maxDate = new Date(rangeMatch[2]);
              minDate.setHours(0, 0, 0, 0);
              maxDate.setHours(23, 59, 59, 999);
              prs = prs.filter((pr) => {
                const d = new Date(pr.created_at);
                return d >= minDate && d <= maxDate;
              });
              issues = issues.filter((is) => {
                const d = new Date(is.created_at);
                return d >= minDate && d <= maxDate;
              });
            }
          }

          // Requirement 5: Only count merged PR contributions
          const mergedPRList = prs.filter((pr) =>
            Boolean(pr.pull_request?.merged_at),
          );
          if (mergedPRList.length === 0) return;

          // Filter by year & campus if selected
          if (year && studentSummary.year !== year) return;
          if (campus && studentSummary.campus !== campus) return;

          const studentTotalPRs = prs.length;
          const studentMergedPRs = mergedPRList.length;
          const openPRs = prs.filter((pr) => pr.state === "open").length;
          const closedPRs = prs.filter(
            (pr) => pr.state === "closed" && !pr.pull_request?.merged_at,
          ).length;

          const orgIssues = issues.filter((is) => {
            if (!is.repository_url) return false;
            return (
              repoFromUrl(is.repository_url).split("/")[0]?.toLowerCase() ===
              targetOrgLogin
            );
          });

          // Organization-specific score using existing repo-quality multiplier and aggregateMergedPRScore
          const repoMultiplierFor = (repoFullName: string) => {
            const entry = repoCache[repoFullName];
            if (!entry) return NEUTRAL_MULTIPLIER;
            if (entry.signals && entry.schemaVersion === REPO_SCHEMA_VERSION) {
              return repoMultiplier(entry.signals, Date.now(), {
                selfOwned: false,
              });
            }
            return legacyMultiplier(entry.stars);
          };

          const orgScore = aggregateMergedPRScore(
            mergedPRList,
            (pr) => (pr.repository_url ? repoFromUrl(pr.repository_url) : null),
            repoMultiplierFor,
          );

          orgSummaries.push({
            profile: studentSummary.profile,
            totalPRs: studentTotalPRs,
            mergedPRs: studentMergedPRs,
            openPRs,
            closedPRs,
            scoreMergedPRs: orgScore,
            issuesCount: orgIssues.length,
            year: studentSummary.year,
            campus: studentSummary.campus,
            organizations: [matchedOrg.login],
          });
        } catch (err) {
          console.error(
            `Error processing org contributions for ${studentSummary.profile.login}:`,
            err,
          );
        }
      }),
    );

    // Requirement 6: Rank contributors using organization-specific contributions
    // 1. Number of merged PRs in organization — descending
    // 2. aggregateMergedPRScore() on org merged PRs — descending
    // 3. Total PRs in organization — descending
    // 4. Alphabetical by login
    orgSummaries.sort((a, b) => {
      if (b.mergedPRs !== a.mergedPRs) return b.mergedPRs - a.mergedPRs;
      if (b.scoreMergedPRs !== a.scoreMergedPRs)
        return b.scoreMergedPRs - a.scoreMergedPRs;
      if (b.totalPRs !== a.totalPRs) return b.totalPRs - a.totalPRs;
      return a.profile.login.localeCompare(b.profile.login);
    });

    realContributors = orgSummaries.map((c, i) => ({
      ...c,
      rank: i + 1, // Organization-specific rank
    }));

    otherStudents = [];
    totalPRs = realContributors.reduce((s, c) => s + c.totalPRs, 0);
    totalMerged = realContributors.reduce((s, c) => s + c.mergedPRs, 0);
  } else {
    // ── Normal Contributor Search Mode ─────────────────────────────────────
    const matchesFilters = (s: StudentSummary) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesText =
          s.profile.login.toLowerCase().includes(q) ||
          (s.profile.name ?? "").toLowerCase().includes(q) ||
          (s.year ?? "").toLowerCase().includes(q) ||
          (s.campus ?? "").toLowerCase().includes(q);
        if (!matchesText) return false;
      }
      if (year && s.year !== year) return false;
      if (campus && s.campus !== campus) return false;
      return true;
    };

    const summaries = allSummaries.filter(matchesFilters);
    totalPRs = summaries.reduce((s, c) => s + c.totalPRs, 0);
    totalMerged = summaries.reduce((s, c) => s + c.mergedPRs, 0);

    realContributors = rankedLeaderboard.filter(matchesFilters);
    otherStudents = summaries.filter((s) => !hasActivity(s));
  }

  // In org-search mode, podium shows the organization-specific top 3 contributors.
  // In normal mode, podium shows global top 3, but is hidden if text/year/campus filter is active.
  const podium = isOrgSearch
    ? realContributors.slice(0, 3)
    : search || year || campus
      ? []
      : rankedLeaderboard.slice(0, 3);
  const kicker = PERIOD_KICKERS[period] ?? "ALL TIME";

  const refreshedAgo = cachedAt ? getMinutesAgo(cachedAt) : null;

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
          <div className="bg-ground border border-line rounded-2xl shadow-card grid grid-cols-2 md:grid-cols-4">
            {[
              {
                label: "Students",
                value: allSummaries?.length ?? 0,
                num: "text-ink",
              },
              {
                label: "Contributors",
                value: realContributors.length,
                num: "text-brand-600",
              },
              {
                label: "Pull requests",
                value: totalPRs,
                num: "text-ink",
              },
              {
                label: "Merged PRs",
                value: totalMerged,
                num: "text-success-600",
              },
            ].map((s, i) => (
              <div
                key={s.label}
                className={`px-5 py-4 ${i > 0 ? "border-l border-line" : ""} ${i >= 2 ? "max-md:border-t max-md:border-line" : ""} ${i === 2 ? "max-md:border-l-0" : ""}`}
              >
                <div
                  className={`text-[22px] leading-none font-[650] tabular-nums ${s.num}`}
                >
                  {s.value.toLocaleString("en-IN")}
                </div>
                <div className="text-[12px] text-ink-soft mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar with integrated organization context */}
      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBar
          orgContext={
            isOrgSearch && matchedOrg
              ? {
                  name: matchedOrg.name || matchedOrg.login,
                  login: matchedOrg.login,
                  avatarUrl: matchedOrg.avatarUrl,
                  contributorsCount: realContributors.length,
                  mergedPRs: totalMerged,
                }
              : undefined
          }
        />
      </Suspense>

      {/* Ranked table + other members */}
      <ContributorGrid
        realContributors={realContributors}
        otherStudents={otherStudents}
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
