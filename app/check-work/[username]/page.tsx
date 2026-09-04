import {
  getStudentPRs,
  getStudentIssues,
  getStudentProfile,
  StudentPR,
  StudentIssue,
  GitHubRateLimitError,
} from '@/lib/github';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ShareButton } from '../../contributors/ShareButton';
import { PRsSection, IssuesSection } from '../../contributors/[username]/ContentSections';
import { getBadges } from '@/lib/badges';
import { ContributionChart } from '../../contributors/ContributionChart';
import { getRepoCache } from '@/lib/repo-cache';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `Preview: ${username} — Opensource Tracker` };
}

type Tab = 'prs' | 'merged' | 'open' | 'issues';

// ─── Badges & Chart Helpers ───────────────────────────────────────────────────

export default async function CheckWorkUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ username }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const tab: Tab = rawTab === 'issues' ? 'issues' : rawTab === 'merged' ? 'merged' : rawTab === 'open' ? 'open' : 'prs';

  let profile = null;
  let allPRs: StudentPR[] = [];
  let issues: StudentIssue[] = [];
  let isRateLimited = false;
  let genericError = false;

  try {
    profile = await getStudentProfile(username);
    if (profile) {
      const [prsRes, issuesRes] = await Promise.all([
        getStudentPRs(username),
        getStudentIssues(username),
      ]);
      if (prsRes === null || issuesRes === null) {
        throw new Error('API_ERROR');
      }
      allPRs = prsRes;
      issues = issuesRes;
    }
  } catch (err: any) {
    console.error('Error fetching check-work details:', err);
    if (err instanceof GitHubRateLimitError || err.message === 'RATE_LIMIT') {
      isRateLimited = true;
    } else {
      genericError = true;
    }
  }

  // 1. Rate Limit Error Page
  if (isRateLimited) {
    return (
      <main className="min-h-screen bg-panel flex flex-col items-center justify-center text-center px-4 py-12">
        <div className="bg-ground border border-line rounded-2xl p-8 max-w-md shadow-card">
          <div className="w-14 h-14 rounded-xl bg-warning-0 flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-warning-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
          </div>
          <h1 className="text-xl font-[650] text-ink mb-3">GitHub API Rate Limit Hit</h1>
          <p className="text-ink-soft text-sm leading-relaxed mb-6">
            The public GitHub API search rate limit has been hit. Please sign in with your GitHub account to authenticate your requests and get your personal high rate limits (5,000 requests/hour).
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/api/auth/github"
              prefetch={false}
              className="w-full flex items-center justify-center gap-2 bg-brand-solid hover:bg-brand-solid-hover text-white py-3 rounded-xl text-sm font-[550] transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              Sign In with GitHub
            </Link>
            <Link
              href="/"
              className="text-ink-soft hover:text-ink text-xs font-[550] py-2 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 2. Generic Error or Not Found Page
  if (!profile || genericError) {
    return (
      <main className="min-h-screen bg-panel flex flex-col items-center justify-center text-center px-4 py-12">
        <div className="bg-ground border border-line rounded-2xl p-8 max-w-md">
          <div className="w-14 h-14 rounded-xl bg-panel-2 flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <h1 className="text-xl font-[650] text-ink mb-3">GitHub User Not Found</h1>
          <p className="text-ink-soft text-sm leading-relaxed mb-6">
            We couldn&apos;t find GitHub username <span className="text-violet-600 font-[550]">@{username}</span>. Make sure the username is spelled correctly.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-brand-solid hover:bg-brand-solid-hover text-white px-5 py-2.5 rounded-xl transition-all text-xs font-[550]"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  const counts = {
    prs: allPRs.length,
    mergedPRs: allPRs.filter(pr => pr.pull_request?.merged_at).length,
    openPRs: allPRs.filter(pr => pr.state === 'open').length,
    issues: issues.length,
  };

  const prs = tab === 'merged' ? allPRs.filter(pr => pr.pull_request?.merged_at)
            : tab === 'open'   ? allPRs.filter(pr => pr.state === 'open')
            : allPRs;

  const badges = getBadges(allPRs, await getRepoCache());

  return (
    <main className="min-h-screen bg-panel">
      {/* Navigation back */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-ink-soft hover:text-ink-mid transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>
      </div>

      {/* Alert Banner for Preview Mode */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="bg-brand-0 rounded-2xl px-5 py-4 text-sm text-violet-600 flex flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse flex-shrink-0" />
            <span>
              <strong>Preview Sandbox:</strong> Showing contributions for <span className="text-ink">@{profile.login}</span>. You are not registered on the leaderboards.
            </span>
          </span>
          <Link
            href="/join"
            className="bg-brand-solid hover:bg-brand-solid-hover text-white px-3.5 py-1.5 rounded-xl transition-all text-xs font-[550] "
          >
            Request to Join Tracker
          </Link>
        </div>
      </div>

      {/* Profile hero */}
      <div className="relative overflow-hidden pt-8 pb-10 px-4">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-brand-100/40 blur-[80px] rounded-full" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="relative flex-shrink-0">
              <Image src={profile.avatar_url} alt={profile.login} width={112} height={112} unoptimized
                className="w-28 h-28 rounded-full ring-4 ring-violet-200 shadow-pop object-cover" />
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl font-[650] text-ink">{profile.name ?? profile.login}</h1>
              <p className="text-ink-soft text-sm mt-0.5">@{profile.login}</p>
              {profile.bio && <p className="text-ink-mid mt-3 max-w-lg leading-relaxed">{profile.bio}</p>}

              {/* What this contributor's merged work shows */}
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4 justify-center sm:justify-start">
                  {badges.map((b) => (
                    <span
                      key={b.id}
                      title={b.desc}
                      className="inline-flex items-center text-[11.5px] font-[550] text-ink-mid bg-panel-2 px-2.5 py-1 rounded-full cursor-help"
                    >
                      {b.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 mt-4 justify-center sm:justify-start text-sm text-ink-soft">
                {profile.company && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M1.75 16A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0h8.5C11.216 0 12 .784 12 1.75v5.5a.75.75 0 0 1-1.5 0v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h3.75a.75.75 0 0 1 0 1.5H1.75z" />
                    </svg>
                    {profile.company}
                  </span>
                )}
                {profile.location && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 0a5 5 0 0 0-5 5c0 2.76 2.5 4.9 5 8 2.5-3.1 5-5.24 5-8a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                    </svg>
                    {profile.location}
                  </span>
                )}
                <a href={profile.html_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-ink-mid transition-colors">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  GitHub profile
                </a>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 justify-center sm:justify-start">
                <ShareButton
                  username={profile.login}
                  displayName={profile.name ?? profile.login}
                  avatarUrl={profile.avatar_url}
                  mergedCount={counts.mergedPRs}
                  totalCount={counts.prs}
                  badges={badges}
                />
              </div>
            </div>
          </div>

          {/* Interactive stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            {[
              { tabId: 'prs',    label: 'Total PRs', value: counts.prs,       color: 'text-ink',        ring: 'ring-line-strong'        },
              { tabId: 'merged', label: 'Merged',    value: counts.mergedPRs,  color: 'text-success-600',  ring: 'ring-success-200'  },
              { tabId: 'open',   label: 'Open',      value: counts.openPRs,   color: 'text-brand-600',     ring: 'ring-brand-200'     },
              { tabId: 'issues', label: 'Issues',    value: counts.issues,    color: 'text-violet-600',   ring: 'ring-violet-200'   },
            ].map(({ tabId, label, value, color, ring }) => {
              const active = tab === tabId;
              return (
                <Link
                  key={tabId}
                  href={`/check-work/${username}?tab=${tabId}`}
                  className={`rounded-xl p-4 text-center transition-all border ${
                    active
                      ? `bg-panel border-line-strong ring-1 ${ring}`
                      : 'bg-ground border-line hover:bg-panel hover:border-line-heavy'
                  }`}
                >
                  <div className={`text-2xl font-[650] tabular-nums ${color}`}>{value}</div>
                  <div className={`text-xs mt-0.5 ${active ? 'text-ink-mid' : 'text-ink-soft'}`}>{label}</div>
                  {active && <div className={`w-6 h-0.5 rounded-full mx-auto mt-2 ${color.replace('text-', 'bg-')}`} />}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Contribution Trend Chart */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        {/* This is a server component: it renders once per request, so "now"
            is request time and is stable for the life of the render. */}
        {/* eslint-disable-next-line react-hooks/purity */}
        <ContributionChart prs={allPRs} nowMs={Date.now()} />
      </div>

      {/* Lists of contributions */}
      <div className="max-w-4xl mx-auto px-4 pb-24">
        {tab !== 'issues' && <PRsSection key={tab} prs={prs} />}
        {tab === 'issues' && <IssuesSection key={tab} issues={issues} />}
      </div>
    </main>
  );
}
