import {
  getStudentPRs,
  getStudentIssues,
  getStudentProfile,
  StudentPR,
  StudentIssue,
  FAIL_STATE_KEY,
  FailState,
} from '@/lib/github';
import Link from 'next/link';
import Image from 'next/image';
import { ShareButton } from '../ShareButton';
import { RefreshButton } from '../RefreshButton';
import { readProfileCache, writeProfileCache } from '@/lib/profile-cache';
import { getStudentsKV } from '@/lib/kv-students';
import { kvGet, kvSet } from '@/lib/kv';
import { cookies } from 'next/headers';
import { getRepoCache } from '@/lib/repo-cache';
import { getFlaggedPRIdSet } from '@/lib/flagged';
import { PRsSection, IssuesSection } from './ContentSections';

async function queueBackgroundRefresh(username: string) {
  try {
    const queue = await kvGet<string[]>('refresh_queue') || [];
    if (!queue.some(u => u.toLowerCase() === username.toLowerCase())) {
      queue.push(username);
      await kvSet('refresh_queue', queue);
    }
  } catch (err) {
    console.error('Failed to queue background refresh for:', username, err);
  }
}

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `${username} — Opensource Tracker` };
}

type Tab = 'prs' | 'merged' | 'open' | 'issues';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterByPeriod<T extends { created_at: string }>(
  items: T[],
  period?: string,
  from?: string,
  to?: string
): T[] {
  if (!period || period === 'all') return items;

  const getMsAgo = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

  let minTime = 0;
  let maxTime = Infinity;

  switch (period) {
    case '1day':
      minTime = getMsAgo(1);
      break;
    case 'week':
      minTime = getMsAgo(7);
      break;
    case 'month':
      minTime = getMsAgo(30);
      break;
    case '2months':
      minTime = getMsAgo(60);
      break;
    case '3months':
      minTime = getMsAgo(90);
      break;
    case '6months':
      minTime = getMsAgo(180);
      break;
    case 'year':
      minTime = getMsAgo(365);
      break;
    case 'custom':
      if (from) minTime = new Date(from).getTime();
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        maxTime = toDate.getTime();
      }
      break;
  }

  return items.filter((item) => {
    const time = new Date(item.created_at).getTime();
    return time >= minTime && time <= maxTime;
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ContributorPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>;
}) {
  const [{ username }, { tab: rawTab, period, from, to }, students] = await Promise.all([
    params,
    searchParams,
    getStudentsKV(),
  ]);
  const student = students.find((s) => s.github.toLowerCase() === username.toLowerCase());
  const tab: Tab = rawTab === 'issues' ? 'issues' : rawTab === 'merged' ? 'merged' : rawTab === 'open' ? 'open' : 'prs';

  let profile = null;
  let allPRs: StudentPR[] = [];
  let issues: StudentIssue[] = [];
  let cachedAt: string | null = null;
  // Set when a sync was actually attempted (live, for logged-in viewers) and
  // failed outright — distinct from simply "not synced yet" — so the
  // initializing page can tell a visitor the truth instead of always saying
  // "check back in a few minutes" for profiles that will never resolve.
  let syncFailed = false;

  // Detect if user is logged in — logged-in users use their own OAuth token
  // (personal 5,000 req/hr quota) so live fetches are safe for them.
  let userLoggedIn = false;
  try {
    const cookieStore = await cookies();
    userLoggedIn = !!cookieStore.get('github_oauth_token')?.value;
  } catch { /* outside request context */ }

  const cached = await readProfileCache(username);
  if (cached) {
    // 1. Always serve cached content instantly
    profile = cached.profile;
    allPRs = cached.prs;
    issues = cached.issues;
    cachedAt = cached.cachedAt;

    // 2. Cache stale (>2hrs) — logged-in users get an immediate live re-fetch;
    //    anonymous users are queued for the background worker.
    const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
    if (ageMs > 2 * 60 * 60 * 1000) {
      if (userLoggedIn) {
        // Live refresh using their token — fire-and-forget, don't block render
        Promise.all([
          getStudentProfile(username),
          getStudentPRs(username),
          getStudentIssues(username),
        ]).then(([freshProfile, freshPRs, freshIssues]) => {
          if (freshProfile && freshPRs !== null && freshIssues !== null) {
            writeProfileCache(username, freshProfile, freshPRs, freshIssues);
          }
        }).catch(() => { /* rate limit or network error — silently fall back to cached */ });
      } else {
        queueBackgroundRefresh(username);
      }
    }
  } else {
    // 3. No cache at all.
    if (userLoggedIn) {
      // Logged-in: fetch synchronously with their token so they see real data immediately.
      try {
        const [freshProfile, rawPRs, freshIssues] = await Promise.all([
          getStudentProfile(username),
          getStudentPRs(username),
          getStudentIssues(username),
        ]);
        if (freshProfile && rawPRs !== null && freshIssues !== null) {
          profile = freshProfile;
          issues = freshIssues;

          const repoCache = await getRepoCache();
          const flagged = await getFlaggedPRIdSet();

          allPRs = rawPRs.filter(pr => {
            if (!pr.repository_url) return true;
            const repo = pr.repository_url.replace('https://api.github.com/repos/', '');
            const key = `${repo}#${pr.number}`;

            if (flagged.has(key)) return false;
            const repoEntry = repoCache[repo];
            if (repoEntry && repoEntry.valid === false) return false;

            return true;
          });

          await writeProfileCache(username, freshProfile, allPRs, freshIssues);
          cachedAt = new Date().toISOString();
        } else {
          // We actually made the live calls and one came back empty/failed —
          // not "not synced yet," a real failure just happened right here.
          syncFailed = true;
        }
      } catch (err) {
        console.error(`Logged-in live fetch failed for ${username}:`, err);
        syncFailed = true;
        queueBackgroundRefresh(username);
      }
    } else {
      // Anonymous: queue background refresh, show initializing state — unless
      // the background worker has already attempted (and failed on) this
      // student at least once (see refresh_fail_state in lib/github.ts), in
      // which case "check back in a few minutes" would just be misleading —
      // it's still retried on the normal cycle, just not about to resolve
      // in the next few minutes the way a genuinely-new student would.
      queueBackgroundRefresh(username);
      try {
        const failState = await kvGet<FailState>(FAIL_STATE_KEY);
        if (failState?.[username.toLowerCase()]) {
          syncFailed = true;
        }
      } catch { /* fail open to the normal "queued" message */ }
    }
  }

  // Show a clean "initializing" page for uncached profiles visited by anonymous users
  if (!profile) {
    return (
      <main className="min-h-screen bg-panel flex items-center justify-center px-4">
        <div className="text-center max-w-md bg-white border border-line rounded-2xl shadow-card p-8">
          <div className="w-14 h-14 rounded-xl bg-brand-0 flex items-center justify-center mx-auto mb-5">
            {syncFailed ? (
              <svg className="w-6 h-6 text-warning-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
          </div>
          <h1 className="text-lg font-[650] text-ink mb-2">
            {syncFailed ? "Couldn't sync this profile" : 'Profile initializing'}
          </h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-6">
            {syncFailed ? (
              <>
                We couldn&apos;t fetch data for <span className="font-[600] text-ink">@{username}</span> from
                GitHub. This usually means the account is private, restricted, or doesn&apos;t exist. We&apos;ll keep
                retrying periodically — if this is your profile, check that it&apos;s public on GitHub.
              </>
            ) : (
              <>
                <span className="font-[600] text-ink">@{username}</span> has been queued for data sync.
                Check back in a few minutes — the background worker will populate this profile shortly.
              </>
            )}
          </p>
          <a
            href={`https://github.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-[11px] bg-white border border-line-strong hover:bg-panel text-ink text-sm font-[550] transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            View on GitHub
          </a>
        </div>
      </main>
    );
  }

  const repoCache = await getRepoCache();
  const flagged = await getFlaggedPRIdSet();

  // Strip out spam PRs so they don't even appear on the profile page
  const validPRs = allPRs.filter(pr => {
    if (!pr.repository_url) return true;
    const repo = pr.repository_url.replace('https://api.github.com/repos/', '');
    const key = `${repo}#${pr.number}`;

    if (flagged.has(key)) return false;
    const repoEntry = repoCache[repo];
    if (repoEntry && repoEntry.valid === false) return false;

    return true;
  });

  const filteredPRs = filterByPeriod(validPRs, period, from, to);
  const filteredIssues = filterByPeriod(issues, period, from, to);

  const counts = {
    prs: filteredPRs.length,
    mergedPRs: filteredPRs.filter(pr => pr.pull_request?.merged_at).length,
    openPRs: filteredPRs.filter(pr => pr.state === 'open').length,
    issues: filteredIssues.length,
  };

  const prs = tab === 'merged' ? filteredPRs.filter(pr => pr.pull_request?.merged_at)
            : tab === 'open'   ? filteredPRs.filter(pr => pr.state === 'open')
            : filteredPRs;

  const lifetimeMergedCount = validPRs.filter(pr => pr.pull_request?.merged_at).length;
  const badges = getBadges(validPRs, lifetimeMergedCount);

  return (
    <main className="min-h-screen bg-panel">
      {/* Back nav */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-7">
        <Link
          href={`/contributors${period ? `?period=${period}` : ''}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
          className="inline-flex items-center gap-2 text-ink-soft hover:text-ink transition-colors text-[13.5px] font-[500]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Leaderboard
        </Link>
      </div>

      {/* Identity card */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-4">
        <div className="bg-white border border-line rounded-2xl shadow-card p-6 md:p-7">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <Image src={profile.avatar_url} alt={profile.login} width={96} height={96} unoptimized
              className="w-24 h-24 rounded-full border-[3px] border-line object-cover shrink-0" />

            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex items-center gap-2.5 justify-center sm:justify-start flex-wrap">
                <h1 className="text-[26px] font-[650] tracking-[-0.01em] text-ink">{profile.name ?? profile.login}</h1>
                {counts.mergedPRs > 0 && counts.mergedPRs <= 5 && (
                  <span className="text-xs font-[600] px-2.5 py-1 rounded-full bg-success-0 text-success-600">
                    🌱 New contributor
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 justify-center sm:justify-start flex-wrap mt-1">
                <p className="text-ink-soft text-sm">@{profile.login}</p>
                {(student?.campus || student?.year) && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-line-heavy" />
                    <p className="text-ink-soft text-sm">
                      {[student?.campus, student?.year].filter(Boolean).join(' · ')}
                    </p>
                  </>
                )}
              </div>

              {profile.bio && <p className="text-ink-mid text-sm mt-3 max-w-lg leading-relaxed">{profile.bio}</p>}

              {/* Badges showcase */}
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                  {badges.map((b) => (
                    <div
                      key={b.id}
                      title={b.desc}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-[600] px-2.5 py-1 rounded-full cursor-help ${b.style}`}
                    >
                      <span>{b.emoji}</span>
                      <span>{b.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 mt-4 justify-center sm:justify-start text-[13px] text-ink-soft">
                {profile.company && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M1.75 16A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0h8.5C11.216 0 12 .784 12 1.75v5.5a.75.75 0 0 1-1.5 0v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h3.75a.75.75 0 0 1 0 1.5H1.75z" />
                    </svg>
                    {profile.company}
                  </span>
                )}
                {profile.location && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M8 0a5 5 0 0 0-5 5c0 2.76 2.5 4.9 5 8 2.5-3.1 5-5.24 5-8a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                    </svg>
                    {profile.location}
                  </span>
                )}
                <a href={profile.html_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 font-[500] hover:text-brand-600 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  GitHub profile
                </a>
              </div>

              {/* Actions: Share + Refresh */}
              <div className="mt-5 flex flex-wrap items-center gap-3 justify-center sm:justify-start">
                <ShareButton
                  username={profile.login}
                  displayName={profile.name ?? profile.login}
                  avatarUrl={profile.avatar_url}
                  mergedCount={counts.mergedPRs}
                  totalCount={counts.prs}
                  badges={badges}
                />
                <RefreshButton cachedAt={cachedAt} username={profile.login} />
              </div>
            </div>
          </div>
        </div>

        {/* Clickable stat cards — these ARE the navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { tabId: 'prs',    label: 'Total PRs', value: counts.prs,       num: 'text-ink',         bar: 'bg-ink'         },
            { tabId: 'merged', label: 'Merged',    value: counts.mergedPRs, num: 'text-success-600', bar: 'bg-success-500' },
            { tabId: 'open',   label: 'Open',      value: counts.openPRs,   num: 'text-brand-600',   bar: 'bg-brand-500'   },
            { tabId: 'issues', label: 'Issues',    value: counts.issues,    num: 'text-violet-600',  bar: 'bg-violet-500'  },
          ].map(({ tabId, label, value, num, bar }) => {
            const active = tab === tabId;
            return (
              <Link
                key={tabId}
                href={`/contributors/${username}?tab=${tabId}${period ? `&period=${period}` : ''}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
                className={`rounded-2xl p-4 text-center transition-all border bg-white ${
                  active
                    ? 'border-line-heavy shadow-card-hover'
                    : 'border-line shadow-card hover:border-line-heavy'
                }`}
              >
                <div className={`text-2xl font-[650] tabular-nums ${num}`}>{value}</div>
                <div className={`text-xs mt-0.5 ${active ? 'text-ink-mid font-[550]' : 'text-ink-soft'}`}>{label}</div>
                <div className={`w-6 h-0.5 rounded-full mx-auto mt-2 ${active ? bar : 'bg-transparent'}`} />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Active period filter banner */}
      {period && period !== 'all' && (
        <div className="max-w-4xl mx-auto px-4 md:px-6 mt-4">
          <div className="bg-brand-0 rounded-2xl px-5 py-3.5 text-sm text-brand-700 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
              Showing activity filtered by:{' '}
              <strong className="font-[650]">
                {period === 'custom'
                  ? `${from} to ${to}`
                  : period === '1day'
                  ? 'last 24 hours'
                  : period === 'week'
                  ? 'last 7 days'
                  : period === 'month'
                  ? 'last 30 days'
                  : `last ${period.replace('months', ' months').replace('year', 'year')}`}
              </strong>
            </span>
            <Link
              href={`/contributors/${username}${rawTab ? `?tab=${rawTab}` : ''}`}
              className="bg-white hover:bg-brand-0 border border-brand-100 px-3.5 py-1.5 rounded-[9px] transition-colors text-xs font-[650] text-brand-600"
            >
              Clear filter
            </Link>
          </div>
        </div>
      )}

      {/* Contribution trend chart */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 mt-4">
        <ContributionChart prs={validPRs} />
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 mt-6 pb-20">
        {tab !== 'issues' && <PRsSection key={tab} prs={prs} />}
        {tab === 'issues' && <IssuesSection key={tab} issues={filteredIssues} />}
      </div>
    </main>
  );
}

// ─── Helpers for Visual Chart and Badges ─────────────────────────────────────

interface Badge {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  style: string;
}

function getBadges(allPRs: StudentPR[], mergedCount: number): Badge[] {
  const list: Badge[] = [];

  // 1. 🌱 First Merge
  if (mergedCount >= 1) {
    list.push({
      id: 'first_merge',
      name: 'First Merge',
      emoji: '🌱',
      desc: 'First collaborative pull request merged',
      style: 'bg-success-0 text-success-600',
    });
  }

  // 2. 🔥 Merging Machine
  if (mergedCount >= 10) {
    list.push({
      id: 'merging_machine',
      name: 'Merging Machine',
      emoji: '🔥',
      desc: '10+ open-source contributions merged',
      style: 'bg-warning-0 text-warning-600',
    });
  }

  // 3. 🐞 Bug Squasher
  const hasBugFix = allPRs.some((pr) => {
    const title = pr.title.toLowerCase();
    const hasBugLabel = pr.labels.some((l) => {
      const name = l.name.toLowerCase();
      return name.includes('bug') || name.includes('fix');
    });
    return pr.pull_request?.merged_at && (title.includes('fix') || title.includes('bug') || hasBugLabel);
  });
  if (hasBugFix) {
    list.push({
      id: 'bug_squasher',
      name: 'Bug Squasher',
      emoji: '🐞',
      desc: 'Squashed bugs in collaborative projects',
      style: 'bg-error-0 text-error-600',
    });
  }

  // 4. 📚 Documentation Hero
  const hasDocs = allPRs.some((pr) => {
    const title = pr.title.toLowerCase();
    const hasDocLabel = pr.labels.some((l) => {
      const name = l.name.toLowerCase();
      return name.includes('doc') || name.includes('documentation') || name.includes('readme');
    });
    return pr.pull_request?.merged_at && (title.includes('doc') || title.includes('readme') || hasDocLabel);
  });
  if (hasDocs) {
    list.push({
      id: 'doc_hero',
      name: 'Doc Hero',
      emoji: '📚',
      desc: 'Merged documentation improvements',
      style: 'bg-brand-0 text-brand-600',
    });
  }

  // 5. ⚡ Speed Demon (3+ merged PRs in a 7-day window)
  const mergedPRs = allPRs.filter((pr) => pr.pull_request?.merged_at);
  let isSpeedDemon = false;

  if (mergedPRs.length >= 3) {
    const sortedDates = mergedPRs
      .map((pr) => new Date(pr.pull_request.merged_at!).getTime())
      .sort((a, b) => a - b);

    for (let i = 0; i <= sortedDates.length - 3; i++) {
      const diffDays = (sortedDates[i + 2] - sortedDates[i]) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7) {
        isSpeedDemon = true;
        break;
      }
    }
  }

  if (isSpeedDemon) {
    list.push({
      id: 'speed_demon',
      name: 'Speed Demon',
      emoji: '⚡',
      desc: 'Merged 3+ pull requests within a single week',
      style: 'bg-gold-0 text-gold-600',
    });
  }

  return list;
}

function getChartData(prs: StudentPR[]) {
  const months: Array<{ label: string; year: number; month: number; count: number }> = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth(),
      count: 0,
    });
  }

  for (const pr of prs) {
    const prDate = new Date(pr.created_at);
    const y = prDate.getFullYear();
    const m = prDate.getMonth();
    const match = months.find((mo) => mo.year === y && mo.month === m);
    if (match) {
      match.count++;
    }
  }

  return months;
}

function ContributionChart({ prs }: { prs: StudentPR[] }) {
  const months = getChartData(prs);
  const maxVal = Math.max(...months.map((m) => m.count));
  const displayMax = maxVal === 0 ? 5 : maxVal;

  const width = 500;
  const height = 140;
  const paddingLeft = 35;
  const paddingRight = 15;
  const paddingTop = 15;
  const paddingBottom = 25;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = months.map((m, i) => {
    const x = paddingLeft + (i * chartWidth) / 5;
    const y = paddingTop + chartHeight - (m.count / displayMax) * chartHeight;
    return { x, y, value: m.count, label: m.label };
  });

  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${lineD} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

  return (
    <div className="bg-white border border-line rounded-2xl shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-ink text-sm font-[650]">Contribution trend</h2>
        <span className="text-ink-soft text-xs">
          PRs per month{maxVal > 0 ? ` · peak ${maxVal}` : ''}
        </span>
      </div>

      <div className="w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0673f9" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#0673f9" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.5, 1].map((ratio) => {
            const y = paddingTop + ratio * chartHeight;
            const labelValue = Math.round(displayMax - ratio * displayMax);
            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#edeff3"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] font-[550]"
                  fill="#8c95a6"
                >
                  {maxVal === 0 && ratio > 0 ? '' : labelValue}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {maxVal > 0 && <path d={areaD} fill="url(#trend-area)" />}

          {/* Line */}
          {maxVal > 0 ? (
            <path
              d={lineD}
              fill="none"
              stroke="#0673f9"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <line
              x1={paddingLeft}
              y1={paddingTop + chartHeight}
              x2={width - paddingRight}
              y2={paddingTop + chartHeight}
              stroke="#e1e5ea"
              strokeWidth="1.5"
            />
          )}

          {/* Data Points */}
          {maxVal > 0 &&
            points.map((p, i) => (
              <g key={i} className="group/point">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="6"
                  fill="transparent"
                  className="cursor-help"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  fill="#ffffff"
                  stroke="#0673f9"
                  strokeWidth="2"
                  className="transition-all group-hover/point:fill-brand-500"
                />
                {/* Value tooltip label displayed on hover */}
                {p.value > 0 && (
                  <g className="opacity-0 group-hover/point:opacity-100 transition-opacity pointer-events-none">
                    <rect
                      x={p.x - 14}
                      y={p.y - 24}
                      width="28"
                      height="16"
                      rx="5"
                      fill="#0b0c0e"
                    />
                    <text
                      x={p.x}
                      y={p.y - 12.5}
                      textAnchor="middle"
                      className="text-[9px] font-[650]"
                      fill="#ffffff"
                    >
                      {p.value}
                    </text>
                  </g>
                )}
              </g>
            ))}

          {/* X-axis Month Labels */}
          {points.map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={height - 5}
              textAnchor="middle"
              className="text-[9px] font-[550]"
              fill="#5b6271"
            >
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
