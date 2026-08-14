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
import { notFound } from 'next/navigation';
import { ShareButton } from '../ShareButton';
import { RefreshButton } from '../RefreshButton';
import { readProfileCache, writeProfileCache, isProfileFresh } from '@/lib/profile-cache';
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
      <main className="min-h-screen bg-[#030712] text-white flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-white/30 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white/80 mb-2">
            {syncFailed ? "Couldn't Sync This Profile" : 'Profile Initializing'}
          </h1>
          <p className="text-sm text-white/40 mb-6">
            {syncFailed ? (
              <>
                We couldn't fetch data for <span className="font-mono text-white/60">@{username}</span> from
                GitHub. This usually means the account is private, restricted, or doesn't exist. We'll keep
                retrying periodically — if this is your profile, check that it's public on GitHub.
              </>
            ) : (
              <>
                <span className="font-mono text-white/60">@{username}</span> has been queued for data sync.
                Check back in a few minutes — the background worker will populate this profile shortly.
              </>
            )}
          </p>
          <a
            href={`https://github.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] text-sm transition-all"
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
    <main className="min-h-screen bg-[#030712]">
      {/* Back nav */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <Link 
          href={`/contributors${period ? `?period=${period}` : ''}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`} 
          className="inline-flex items-center gap-2 text-white/30 hover:text-white/70 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          All contributors
        </Link>
      </div>

      {/* Profile hero */}
      <div className="relative overflow-hidden pt-8 pb-10 px-4">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-purple-600/8 blur-[80px] rounded-full" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <Image src={profile.avatar_url} alt={profile.login} width={112} height={112} unoptimized
                className="w-28 h-28 rounded-full ring-4 ring-purple-500/25 shadow-2xl shadow-purple-900/30 object-cover" />
            </div>

            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center gap-3 justify-center sm:justify-start flex-wrap">
                <h1 className="text-3xl font-bold text-white">{profile.name ?? profile.login}</h1>
                {counts.mergedPRs > 0 && counts.mergedPRs <= 5 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-medium">
                    🌱 New Contributor
                  </span>
                )}
                {student?.year && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-400 font-medium">
                    🎓 {student.year}
                  </span>
                )}
                {student?.campus && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 font-medium">
                    📍 {student.campus}
                  </span>
                )}
              </div>
              <p className="text-white/40 text-sm mt-0.5">@{profile.login}</p>



              {profile.bio && <p className="text-white/55 mt-3 max-w-lg leading-relaxed">{profile.bio}</p>}

              {/* Badges showcase */}
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                  {badges.map((b) => (
                    <div
                      key={b.id}
                      title={b.desc}
                      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-help ${b.style}`}
                    >
                      <span>{b.emoji}</span>
                      <span>{b.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 mt-4 justify-center sm:justify-start text-sm text-white/35">
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
                  className="flex items-center gap-1.5 hover:text-white/70 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  GitHub Profile
                </a>
              </div>

              {/* Actions: Share + Refresh */}
              <div className="mt-4 flex flex-wrap items-center gap-3 justify-center sm:justify-start">
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

          {/* Clickable stat cards — these ARE the navigation */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            {[
              { tabId: 'prs',    label: 'Total PRs', value: counts.prs,       color: 'text-white',        ring: 'ring-white/20'        },
              { tabId: 'merged', label: 'Merged',    value: counts.mergedPRs,  color: 'text-emerald-400',  ring: 'ring-emerald-500/40'  },
              { tabId: 'open',   label: 'Open',      value: counts.openPRs,   color: 'text-teal-400',     ring: 'ring-teal-500/40'     },
              { tabId: 'issues', label: 'Issues',    value: counts.issues,    color: 'text-purple-400',   ring: 'ring-purple-500/40'   },
            ].map(({ tabId, label, value, color, ring }) => {
              const active = tab === tabId;
              return (
                <Link
                  key={tabId}
                  href={`/contributors/${username}?tab=${tabId}${period ? `&period=${period}` : ''}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
                  className={`rounded-xl p-4 text-center transition-all border ${
                    active
                      ? `bg-white/[0.07] border-white/[0.15] ring-1 ${ring}`
                      : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
                  <div className={`text-xs mt-0.5 ${active ? 'text-white/60' : 'text-white/35'}`}>{label}</div>
                  {active && <div className={`w-6 h-0.5 rounded-full mx-auto mt-2 ${color.replace('text-', 'bg-')}`} />}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active period filter banner */}
      {period && period !== 'all' && (
        <div className="max-w-4xl mx-auto px-4 mb-6">
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl px-5 py-4 text-sm text-purple-300/90 flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />
              Showing activity filtered by:{' '}
              <strong className="text-white/90">
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
              className="bg-white/5 border border-white/10 hover:bg-white/10 px-3.5 py-1.5 rounded-xl transition-all text-xs font-semibold text-white/80"
            >
              Clear filter
            </Link>
          </div>
        </div>
      )}

      {/* Contribution trend chart */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <ContributionChart prs={validPRs} />
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 pb-24">
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
      style: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15',
    });
  }

  // 2. 🔥 Merging Machine
  if (mergedCount >= 10) {
    list.push({
      id: 'merging_machine',
      name: 'Merging Machine',
      emoji: '🔥',
      desc: '10+ open-source contributions merged',
      style: 'bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/15',
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
      style: 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15',
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
      style: 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/15',
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
      style: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/15',
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
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider">Contribution Trend (PRs / Month)</h2>
        {maxVal > 0 && (
          <span className="text-purple-400 text-xs font-medium">
            Peak: {maxVal} PR{maxVal > 1 ? 's' : ''}/mo
          </span>
        )}
      </div>

      <div className="w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="area-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="line-glow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="50%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#60a5fa" />
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
                  className="stroke-white/[0.05] stroke-1"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-white/20 font-mono font-medium"
                >
                  {maxVal === 0 && ratio > 0 ? '' : labelValue}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {maxVal > 0 && <path d={areaD} fill="url(#area-glow)" />}

          {/* Glowing Line */}
          {maxVal > 0 ? (
            <path
              d={lineD}
              fill="none"
              stroke="url(#line-glow)"
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
              className="stroke-white/10 stroke-[1.5px]"
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
                  className="fill-purple-500/0 stroke-purple-500/0 cursor-help"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  className="fill-[#030712] stroke-purple-400 stroke-2 transition-all group-hover/point:r-5 group-hover/point:fill-purple-400"
                />
                {/* Value tooltip label displayed on hover */}
                {p.value > 0 && (
                  <g className="opacity-0 group-hover/point:opacity-100 transition-opacity pointer-events-none">
                    <rect
                      x={p.x - 14}
                      y={p.y - 22}
                      width="28"
                      height="15"
                      rx="4"
                      className="fill-[#141424] stroke-white/10 stroke-[0.5px]"
                    />
                    <text
                      x={p.x}
                      y={p.y - 12}
                      textAnchor="middle"
                      className="text-[9px] font-bold fill-white/80 font-mono"
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
              className="text-[9px] fill-white/30 font-medium"
            >
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
