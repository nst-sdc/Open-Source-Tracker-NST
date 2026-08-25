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

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `Preview: ${username} — Opensource Tracker` };
}

type Tab = 'prs' | 'merged' | 'open' | 'issues';

// ─── Badges & Chart Helpers ───────────────────────────────────────────────────

interface Badge {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  style: string;
}

function getBadges(allPRs: StudentPR[], mergedCount: number): Badge[] {
  const list: Badge[] = [];
  if (mergedCount >= 1) {
    list.push({
      id: 'first_merge',
      name: 'First Merge',
      emoji: '🌱',
      desc: 'First collaborative pull request merged',
      style: 'bg-success-0 border-success-100 text-success-600 hover:bg-success-100',
    });
  }
  if (mergedCount >= 10) {
    list.push({
      id: 'merging_machine',
      name: 'Merging Machine',
      emoji: '🔥',
      desc: '10+ open-source contributions merged',
      style: 'bg-warning-0 border-warning-200 text-warning-600 hover:bg-warning-0',
    });
  }
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
      style: 'bg-error-0 border-error-100 text-error-600 hover:bg-error-0',
    });
  }
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
      style: 'bg-brand-0 border-brand-100 text-brand-600 hover:bg-brand-0',
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
    if (match) match.count++;
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
    <div className="bg-white border border-line rounded-2xl p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-ink-mid text-xs font-[550] uppercase tracking-wider">Contribution Trend (PRs / Month)</h2>
        {maxVal > 0 && (
          <span className="text-violet-600 text-xs font-[500]">
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
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} className="stroke-white/[0.05] stroke-1" strokeDasharray="4 4" />
                <text x={paddingLeft - 8} y={y + 3} textAnchor="end" className="text-[9px] fill-white/20 font-mono font-[500]">{maxVal === 0 && ratio > 0 ? '' : labelValue}</text>
              </g>
            );
          })}

          {/* Area fill */}
          {maxVal > 0 && <path d={areaD} fill="url(#area-glow)" />}

          {/* Glowing Line */}
          {maxVal > 0 ? (
            <path d={lineD} fill="none" stroke="url(#line-glow)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <line x1={paddingLeft} y1={paddingTop + chartHeight} x2={width - paddingRight} y2={paddingTop + chartHeight} className="stroke-white/10 stroke-[1.5px]" />
          )}

          {/* Data Points */}
          {maxVal > 0 &&
            points.map((p, i) => (
              <g key={i} className="group/point">
                <circle cx={p.x} cy={p.y} r="6" className="fill-purple-500/0 stroke-purple-500/0 cursor-help" />
                <circle cx={p.x} cy={p.y} r="3.5" className="fill-[#030712] stroke-purple-400 stroke-2 transition-all group-hover/point:r-5 group-hover/point:fill-purple-400" />
                {p.value > 0 && (
                  <g className="opacity-0 group-hover/point:opacity-100 transition-opacity pointer-events-none">
                    <rect x={p.x - 14} y={p.y - 22} width="28" height="15" rx="4" className="fill-[#141424] stroke-white/10 stroke-[0.5px]" />
                    <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[9px] font-[650] fill-white/80 font-mono">{p.value}</text>
                  </g>
                )}
              </g>
            ))}

          {/* X-axis labels */}
          {points.map((p, i) => (
            <text key={i} x={p.x} y={height - 5} textAnchor="middle" className="text-[9px] fill-white/30 font-[500]">{p.label}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
        <div className="bg-white border border-line rounded-2xl p-8 max-w-md shadow-card">
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-[650] text-ink mb-3">GitHub API Rate Limit Hit</h1>
          <p className="text-ink-soft text-sm leading-relaxed mb-6">
            The public GitHub API search rate limit has been hit. Please sign in with your GitHub account to authenticate your requests and get your personal high rate limits (5,000 requests/hour).
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/api/auth/github"
              prefetch={false}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl text-sm font-[550] transition-all shadow-md active:scale-95 cursor-pointer"
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
        <div className="bg-white border border-line rounded-2xl p-8 max-w-md">
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-xl font-[650] text-ink mb-3">GitHub User Not Found</h1>
          <p className="text-ink-soft text-sm leading-relaxed mb-6">
            We couldn&apos;t find GitHub username <span className="text-violet-600 font-[550]">@{username}</span>. Make sure the username is spelled correctly.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-xl transition-all text-xs font-[550]"
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

  const badges = getBadges(allPRs, counts.mergedPRs);

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
            className="bg-brand-500 hover:bg-brand-600 text-white px-3.5 py-1.5 rounded-xl transition-all text-xs font-[550] "
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
                className="w-28 h-28 rounded-full ring-4 ring-violet-200 shadow-2xl shadow-purple-900/30 object-cover" />
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl font-[650] text-ink">{profile.name ?? profile.login}</h1>
              <p className="text-ink-soft text-sm mt-0.5">@{profile.login}</p>
              {profile.bio && <p className="text-ink-mid mt-3 max-w-lg leading-relaxed">{profile.bio}</p>}

              {/* Badges showcase */}
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                  {badges.map((b) => (
                    <div key={b.id} title={b.desc} className={`inline-flex items-center gap-1.5 text-[10px] font-[550] px-2.5 py-1 rounded-lg border transition-all cursor-help ${b.style}`}>
                      <span>{b.emoji}</span>
                      <span>{b.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 mt-4 justify-center sm:justify-start text-sm text-ink-soft">
                {profile.company && <span className="flex items-center gap-1.5">🏢 {profile.company}</span>}
                {profile.location && <span className="flex items-center gap-1.5">📍 {profile.location}</span>}
                <a href={profile.html_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-ink-mid transition-colors">
                  🔗 GitHub Profile
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
                      : 'bg-white border-line hover:bg-panel hover:border-line-heavy'
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
        <ContributionChart prs={allPRs} />
      </div>

      {/* Lists of contributions */}
      <div className="max-w-4xl mx-auto px-4 pb-24">
        {tab !== 'issues' && <PRsSection key={tab} prs={prs} />}
        {tab === 'issues' && <IssuesSection key={tab} issues={issues} />}
      </div>
    </main>
  );
}
