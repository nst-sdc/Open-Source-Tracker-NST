'use client';

import { useState, useEffect } from 'react';

interface Contributor {
  username: string;
  avatarUrl: string;
  prsCount: number;
  mergedPRs: number;
  openPRs: number;
  closedPRs: number;
  issuesCount: number;
  isMaintainer: boolean;
  prs: Array<{ number: number; title: string; url: string; state: string; createdAt: string; mergedAt: string | null }>;
  issues: Array<{ number: number; title: string; url: string; state: string; createdAt: string }>;
}

interface RepoInfo {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  url: string;
}

export default function RepoActivityPage() {
  const [repoInput, setRepoInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userActivity, setUserActivity] = useState<any | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userError, setUserError] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'prs' | 'issues'>('all');
  const [period, setPeriod] = useState<'all' | '1day' | 'week' | 'month' | '2months' | '3months'>('1day');

  // Lock background body scroll when contributor details modal is open
  useEffect(() => {
    if (selectedUser) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [selectedUser]);

  function parseRepoInput(input: string): string | null {
    const clean = input.trim().replace(/\/$/, '');
    // Regex matches:
    // https://github.com/owner/repo
    // git@github.com:owner/repo.git
    // owner/repo
    const regex = /(?:github\.com\/|github\.com:)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\.git)?$/i;
    const match = clean.match(regex);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
    return null;
  }

  async function performSearch(repoPath: string, targetPeriod: typeof period) {
    setLoading(true);
    setError('');
    setSelectedUser(null);
    setUserActivity(null);

    try {
      const res = await fetch(`/api/repo-activity?repo=${encodeURIComponent(repoPath)}&period=${targetPeriod}`);
      const data = await res.json();

      if (res.ok) {
        setRepoInfo(data.repoInfo);
        setContributors(data.contributors);
      } else {
        setError(data.error ?? 'Failed to fetch repository activity.');
      }
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseRepoInput(repoInput);
    if (!parsed) {
      setError('Invalid format. Please enter a repository path (owner/repo) or full GitHub URL.');
      return;
    }
    setRepoInfo(null);
    setContributors([]);
    await performSearch(parsed, period);
  }

  async function handlePeriodChange(newPeriod: typeof period) {
    setPeriod(newPeriod);
    if (repoInfo) {
      await performSearch(repoInfo.fullName, newPeriod);
    }
  }

  async function handleContributorClick(username: string) {
    setSelectedUser(username);
    setLoadingUser(true);
    setUserError('');
    setUserActivity(null);
    try {
      const res = await fetch(`/api/user-activity?username=${encodeURIComponent(username)}&period=all`);
      const data = await res.json();
      if (res.ok) {
        setUserActivity(data);
      } else {
        setUserError(data.error || 'Failed to fetch user activity.');
      }
    } catch {
      setUserError('A network error occurred. Please try again.');
    } finally {
      setLoadingUser(false);
    }
  }

  // Filter contributors based on selected type
  const activeContributors = contributors.filter((c) => {
    if (filterType === 'prs') return c.prsCount > 0;
    if (filterType === 'issues') return c.issuesCount > 0;
    return c.prsCount > 0 || c.issuesCount > 0;
  });

  // Sort contributors dynamically based on selection
  const sortedContributors = [...activeContributors].sort((a, b) => {
    if (filterType === 'prs') {
      return b.prsCount - a.prsCount;
    }
    if (filterType === 'issues') {
      return b.issuesCount - a.issuesCount;
    }
    const totalA = a.prsCount + a.issuesCount;
    const totalB = b.prsCount + b.issuesCount;
    if (totalB !== totalA) return totalB - totalA;
    return b.prsCount - a.prsCount; // tiebreaker: prs first
  });

  const maxActivity = Math.max(
    ...contributors.map((c) => {
      if (filterType === 'prs') return c.prsCount;
      if (filterType === 'issues') return c.issuesCount;
      return c.prsCount + c.issuesCount;
    }),
    1
  );

  return (
    <main className="min-h-screen bg-panel text-ink py-12 px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-4xl mx-auto relative">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-violet-0 border border-violet-100 rounded-full px-4 py-1.5 text-xs font-[550] text-violet-600 mb-4">
            🔥 Sandbox Competition Tracker
          </div>
          <h1 className="text-4xl md:text-5xl font-[650] tracking-tight">
            Repository{' '}
            <span className="text-brand-500">
              Activity Tracker
            </span>
          </h1>
          <p className="text-ink-soft text-sm mt-3 max-w-lg mx-auto leading-relaxed">
            Enter any public GitHub repository link to inspect contributors, active pull requests, issues, and see the competition.
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-10 max-w-2xl mx-auto">
          <input
            type="text"
            required
            placeholder="e.g. facebook/react or https://github.com/vercel/next.js"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            disabled={loading}
            className="flex-1 bg-ground border border-line hover:border-line-heavy rounded-2xl px-5 py-3.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100 focus:bg-ground transition-all"
          />
          <button
            type="submit"
            disabled={loading || !repoInput.trim()}
            className="bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-[550] px-8 py-3.5 rounded-2xl transition-all shadow-brand-btn hover:-translate-y-0.5 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning…
              </>
            ) : (
              'Scan Repository'
            )}
          </button>
        </form>

        {/* Period Filter (Always Visible) */}
        <div className="flex flex-col items-center justify-center gap-3 mb-10 max-w-2xl mx-auto">
          <span className="text-xs font-[550] text-ink-soft uppercase tracking-wider">
            Time Period Filter
          </span>
          <div className="flex bg-ground border border-line rounded-xl p-1 shrink-0">
            {([
              { id: '1day',    label: '24h' },
              { id: 'week',    label: 'Week' },
              { id: 'month',   label: 'Month' },
              { id: '2months', label: '2 Months' },
              { id: '3months', label: '3 Months' },
              { id: 'all',     label: 'All Time' },
            ] as const).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePeriodChange(p.id)}
                className={`px-4 py-2 rounded-lg text-xs font-[550] transition-all cursor-pointer ${
                  period === p.id
                    ? 'bg-brand-500/20 text-violet-600 border border-violet-100'
                    : 'text-ink-soft hover:text-ink-mid'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>


        {error && (
          <div className="bg-error-0 border border-error-100 rounded-2xl p-4 text-error-600 text-sm max-w-2xl mx-auto mb-10 flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 text-error-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <p className="leading-snug">{error}</p>
          </div>
        )}

        {/* Results */}
        {repoInfo && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-500">
            {/* Repo Info Card */}
            <div className="bg-ground border border-line rounded-2xl p-6">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                <div>
                  <a
                    href={repoInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-2xl font-[650] text-ink hover:text-violet-600 transition-colors flex items-center gap-2"
                  >
                    {repoInfo.fullName}
                    <svg className="w-4 h-4 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  {repoInfo.description && (
                    <p className="text-ink-soft text-sm mt-1.5 leading-relaxed max-w-2xl">{repoInfo.description}</p>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-line">
                {[
                  { label: 'Stars', value: repoInfo.stars.toLocaleString(), icon: '⭐️' },
                  { label: 'Forks', value: repoInfo.forks.toLocaleString(), icon: '🍴' },
                  { label: 'Open Issues', value: repoInfo.openIssues.toLocaleString(), icon: '🔧' },
                ].map((s) => (
                  <div key={s.label} className="bg-ground border border-line rounded-2xl p-4 text-center">
                    <div className="text-ink-soft text-xs mb-1 font-mono uppercase tracking-wider flex items-center justify-center gap-1">
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                    </div>
                    <div className="text-lg md:text-xl font-[650] text-ink tabular-nums">{s.value}</div>
                  </div>
                ))}
              </div>
                 {/* Leaderboard Section */}
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-[650] text-ink">Contributor Competition</h2>
                  <p className="text-ink-soft text-xs mt-0.5">Rankings based on active contributions in the selected period.</p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {/* Filter Tabs */}
                  <div className="flex bg-ground border border-line rounded-xl p-1 shrink-0">
                    {([
                      { id: 'all',    label: 'All Activity' },
                      { id: 'prs',    label: 'PRs' },
                      { id: 'issues', label: 'Issues' },
                    ] as const).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setFilterType(t.id);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-[550] transition-all ${
                          filterType === t.id
                            ? 'bg-panel text-ink shadow-sm'
                            : 'text-ink-soft hover:text-ink-mid'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Leaderboard Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedContributors.map((c, index) => {
                  const score =
                    filterType === 'prs'
                      ? c.prsCount
                      : filterType === 'issues'
                      ? c.issuesCount
                      : c.prsCount + c.issuesCount;

                  const widthPercent = (score / maxActivity) * 100;

                  // Gold, Silver, Bronze styling
                  const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
                  const rankBg =
                    index === 0
                      ? 'bg-gold-0 border-gold-100 text-gold-600'
                      : index === 1
                      ? 'bg-panel-2 border-line-strong text-ink-mid'
                      : index === 2
                      ? 'bg-gold-0 border-gold-100 text-gold-600'
                      : 'bg-ground border-line text-ink-soft';

                  return (
                    <div
                      key={c.username}
                      onClick={() => handleContributorClick(c.username)}
                      className="group border rounded-2xl bg-ground border-line sys-card-hover flex flex-col justify-between relative overflow-hidden cursor-pointer active:scale-[0.98]"
                    >
                      {/* Top Rank Badge & Avatar Info */}
                      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={c.avatarUrl}
                              alt={c.username}
                              className="w-12 h-12 rounded-full ring-2 ring-line group-hover:ring-violet-200 transition-all object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="text-ink font-[650] block truncate text-base group-hover:text-violet-600 transition-colors">
                                @{c.username}
                              </span>
                              {c.isMaintainer && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-[500] bg-violet-0 text-violet-600 border border-violet-100">
                                    🛡️ Maintainer
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className={`w-8 h-8 rounded-xl border text-sm font-[650] font-mono flex items-center justify-center shrink-0 ${rankBg}`}>
                            {rankIcon ? rankIcon : index + 1}
                          </div>
                        </div>

                        {/* Activity stats strip */}
                        <div className="grid grid-cols-4 gap-1.5 mt-2">
                          <div className="bg-ground border border-line rounded-xl p-1.5 text-center">
                            <div className="text-[9px] text-ink-soft font-mono uppercase tracking-wider">PRs</div>
                            <div className="text-sm font-[650] text-ink font-mono">{c.prsCount}</div>
                          </div>
                          <div className="bg-ground border border-line rounded-xl p-1.5 text-center">
                            <div className="text-[9px] text-ink-soft font-mono uppercase tracking-wider">Merged</div>
                            <div className="text-sm font-[650] text-success-600 font-mono">{c.mergedPRs}</div>
                          </div>
                          <div className="bg-ground border border-line rounded-xl p-1.5 text-center">
                            <div className="text-[9px] text-ink-soft font-mono uppercase tracking-wider">Open</div>
                            <div className="text-sm font-[650] text-brand-600 font-mono">{c.openPRs}</div>
                          </div>
                          <div className="bg-ground border border-line rounded-xl p-1.5 text-center">
                            <div className="text-[9px] text-ink-soft font-mono uppercase tracking-wider">Issues</div>
                            <div className="text-sm font-[650] text-violet-600 font-mono">{c.issuesCount}</div>
                          </div>
                        </div>

                        {/* Progress Visual */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-ink-soft">
                            <span>Contribution share</span>
                            <span>{Math.round(widthPercent)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-ground rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-500 rounded-full transition-all duration-500"
                              style={{ width: `${widthPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {sortedContributors.length === 0 && (
                  <div className="text-center py-16 bg-ground border border-line rounded-2xl text-ink-soft col-span-full">
                    <div className="text-3xl mb-2">📭</div>
                    <p className="text-sm font-[500]">No activity found for this category</p>
                    <p className="text-xs text-ink-faint mt-1">Try toggling to &quot;All Activity&quot; or scan another repository.</p>
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Scanning Empty State */}
        {!repoInfo && !loading && !error && (
          <div className="text-center py-20 text-ink-soft border border-line bg-ground rounded-2xl animate-in fade-in duration-300">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-30 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-base font-[550] text-ink-soft mb-1">No repository scanned yet</p>
            <p className="text-sm leading-relaxed max-w-sm mx-auto">
              Paste a repository link above to view contributor competition rankings, recent PRs, and issues.
            </p>
          </div>
        )}
      </div>

      {/* User Activity Modal */}
      {selectedUser && (
        <div data-lenis-prevent className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 animate-in fade-in duration-200">
          <div className="bg-ground border border-line rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-pop animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">👤</span>
                <div>
                  <h3 className="text-lg font-[650] text-ink">Contributor Details</h3>
                  <p className="text-xs text-ink-soft">@{selectedUser}&apos;s pull request history across GitHub</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setUserActivity(null);
                }}
                className="text-ink-soft hover:text-ink transition-colors p-1.5 rounded-lg bg-ground border border-line cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin overscroll-contain">
              {loadingUser && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <svg className="w-8 h-8 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm text-ink-soft font-[500]">Fetching contributor statistics...</p>
                </div>
              )}

              {userError && (
                <div className="bg-error-0 border border-error-100 rounded-2xl p-4 text-error-600 text-sm flex items-start gap-3">
                  <svg className="w-5 h-5 flex-shrink-0 text-error-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  <p className="leading-snug">{userError}</p>
                </div>
              )}

              {userActivity && (
                <>
                  {/* Repositories breakdown */}
                  <div>
                    <h4 className="text-xs font-[650] text-ink-mid uppercase tracking-wider mb-3">Repositories Contributed To</h4>
                    {userActivity.repositories.length === 0 ? (
                      <p className="text-sm text-ink-soft italic">No pull requests found in this period.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {userActivity.repositories.map((repo: any) => (
                          <div key={repo.repoName} className="bg-ground border border-line rounded-2xl p-4 space-y-3">
                            <div className="font-[650] text-sm text-ink truncate" title={repo.repoName}>
                              {repo.repoName}
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center text-xs">
                              <div className="bg-ground border border-line rounded-lg p-1">
                                <div className="text-[9px] text-ink-soft">Total</div>
                                <div className="font-mono font-[650] text-ink">{repo.totalPRs}</div>
                              </div>
                              <div className="bg-ground border border-line rounded-lg p-1">
                                <div className="text-[9px] text-success-600">Merged</div>
                                <div className="font-mono font-[650] text-success-600">{repo.mergedPRs}</div>
                              </div>
                              <div className="bg-ground border border-line rounded-lg p-1">
                                <div className="text-[9px] text-brand-600">Open</div>
                                <div className="font-mono font-[650] text-brand-600">{repo.openPRs}</div>
                              </div>
                              <div className="bg-ground border border-line rounded-lg p-1">
                                <div className="text-[9px] text-violet-600">Closed</div>
                                <div className="font-mono font-[650] text-violet-600">{repo.closedPRs}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent PRs Timeline */}
                  <div>
                    <h4 className="text-xs font-[650] text-ink-mid uppercase tracking-wider mb-3">Pull Request History</h4>
                    {userActivity.pullRequests.length === 0 ? (
                      <p className="text-sm text-ink-soft italic">No recent work to display.</p>
                    ) : (
                      <div className="space-y-2">
                        {userActivity.pullRequests.map((pr: any) => (
                          <a
                            key={pr.url}
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start justify-between gap-4 p-3.5 rounded-2xl bg-ground border border-line hover:bg-ground hover:border-line transition-all text-xs text-ink hover:text-ink"
                          >
                            <div className="space-y-1.5 min-w-0">
                              <div className="font-[500] line-clamp-2">
                                <span className="text-ink-soft mr-1.5 font-mono">#{pr.number}</span>
                                {pr.title}
                              </div>
                              <div className="text-[10px] text-ink-soft flex items-center gap-2">
                                <span className="font-[550] text-violet-600/80">{pr.repoName}</span>
                                <span>•</span>
                                <span>{new Date(pr.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-[650] uppercase border shrink-0 ${
                              pr.state === 'open'
                                ? 'bg-brand-0 border-brand-100 text-brand-600'
                                : pr.mergedAt
                                ? 'bg-success-0 border-success-100 text-success-600'
                                : 'bg-violet-0 border-violet-100 text-violet-600'
                            }`}>
                              {pr.mergedAt ? 'merged' : pr.state}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      )}
    </main>
  );
}
