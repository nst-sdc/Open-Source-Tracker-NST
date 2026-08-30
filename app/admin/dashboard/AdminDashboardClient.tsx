'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { FlaggedPR, FlagReason } from '@/lib/flagged';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawPR {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  repository_url: string;
  created_at: string;
  pull_request?: { merged_at: string | null; html_url: string };
  user: { login: string; avatar_url: string };
}

interface PRWithMeta extends RawPR {
  prKey: string;
  repo: string;
  isMerged: boolean;
  flagged?: FlaggedPR;
  approved?: boolean;
}

const REASON_LABELS: Record<FlagReason, { label: string; color: string; bg: string; border: string }> = {
  fake:        { label: 'Fake PR',     color: 'text-error-600',    bg: 'bg-error-0',    border: 'border-error-100' },
  self_pr:     { label: 'Self PR',     color: 'text-warning-600', bg: 'bg-warning-0', border: 'border-warning-200' },
  low_quality: { label: 'Low Quality', color: 'text-gold-600', bg: 'bg-gold-0', border: 'border-gold-100' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function repoFromUrl(url: string) {
  return url.replace('https://api.github.com/repos/', '');
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Fetches ALL PRs for a user, paginating through every page (up to 1000) */
async function fetchPRsForUser(username: string): Promise<RawPR[]> {
  const all: RawPR[] = [];
  let page = 1;
  const maxPages = 10; // 10 × 100 = up to 1000 PRs per user

  while (page <= maxPages) {
    const res = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(`is:pr author:${username} -user:${username}`)}&sort=created&order=desc&per_page=100&page=${page}`,
      { cache: 'no-store' }
    );
    if (!res.ok) break;
    const data = await res.json();
    const items: RawPR[] = data.items ?? [];
    all.push(...items);
    // Stop if we've got everything
    if (all.length >= data.total_count || items.length < 100) break;
    page++;
  }

  return all;
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ pr }: { pr: PRWithMeta }) {
  if (pr.isMerged)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-violet-0 text-violet-600 border border-violet-100 whitespace-nowrap">Merged</span>;
  if (pr.state === 'open')
    return <span className="text-xs px-2 py-0.5 rounded-full bg-brand-0 text-brand-600 border border-brand-100 whitespace-nowrap">Open</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-white text-ink-soft border border-line whitespace-nowrap">Closed</span>;
}

function FlagBadge({ flag }: { flag: FlaggedPR }) {
  const meta = REASON_LABELS[flag.reason];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-[500] whitespace-nowrap ${meta.bg} ${meta.color} ${meta.border}`}>
      ⚑ {meta.label}
    </span>
  );
}

// ─── Flag modal ───────────────────────────────────────────────────────────────

interface FlagModalProps {
  pr: PRWithMeta;
  onClose: () => void;
  onFlagged: (pr: PRWithMeta, reason: FlagReason, note: string) => void;
}

function FlagModal({ pr, onClose, onFlagged }: FlagModalProps) {
  const [reason, setReason] = useState<FlagReason>('fake');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await fetch('/api/admin/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: pr.prKey,
        url: pr.pull_request?.html_url ?? pr.html_url,
        title: pr.title,
        author: pr.user.login,
        reason,
        note: note.trim() || undefined,
      }),
    });
    setLoading(false);
    if (res.ok) {
      onFlagged(pr, reason, note);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={onClose}>
      <div className="bg-white border border-line rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-ink font-[550] text-lg mb-1">Flag PR</h3>
        <p className="text-ink-soft text-sm mb-5 leading-relaxed truncate" title={pr.title}>{pr.title}</p>

        <div className="space-y-3 mb-5">
          {(Object.entries(REASON_LABELS) as [FlagReason, typeof REASON_LABELS[FlagReason]][]).map(([key, meta]) => (
            <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              reason === key ? `${meta.bg} ${meta.border}` : 'bg-white border-line hover:bg-panel'
            }`}>
              <input type="radio" name="flag-reason" value={key} checked={reason === key} onChange={() => setReason(key)} className="accent-purple-500" />
              <div>
                <div className={`font-[500] text-sm ${reason === key ? meta.color : 'text-ink-mid'}`}>{meta.label}</div>
                <div className="text-ink-soft text-xs">
                  {key === 'fake' && 'PR is completely fake or spam'}
                  {key === 'self_pr' && "Merged to contributor's own repository"}
                  {key === 'low_quality' && 'Trivial change not worthy of contribution credit'}
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="mb-5">
          <label className="block text-xs text-ink-soft mb-2 uppercase tracking-wider">Note (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin note…" rows={2}
            className="w-full bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100 resize-none" />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white border border-line text-ink-soft hover:text-ink-mid hover:bg-panel transition-all text-sm font-[500]">
            Cancel
          </button>
          <button onClick={submit} disabled={loading} id="confirm-flag-btn"
            className="flex-1 py-2.5 rounded-xl bg-error-500 hover:bg-error-400 text-white font-[550] transition-all text-sm disabled:opacity-50 ">
            {loading ? 'Flagging…' : '⚑ Flag PR'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PR Row (shared between Queue and Browse) ────────────────────────────────

interface PRRowProps {
  pr: PRWithMeta;
  showAuthor?: boolean;
  onApprove?: (pr: PRWithMeta) => void;
  onFlag: (pr: PRWithMeta) => void;
  onUnflag?: (prKey: string) => void;
  onUnapprove?: (pr: PRWithMeta) => void;
}

function PRRow({ pr, showAuthor, onApprove, onFlag, onUnflag, onUnapprove }: PRRowProps) {
  return (
    <div className={`group flex items-start gap-3 rounded-xl p-4 border transition-all ${
      pr.flagged ? 'bg-error-500/[0.04] border-error-100'
      : pr.approved ? 'bg-success-500/[0.03] border-success-100'
      : 'bg-white border-line hover:bg-panel hover:border-line-heavy'
    }`}>
      <img src={pr.user.avatar_url} alt={pr.user.login} className="w-7 h-7 rounded-full flex-shrink-0 opacity-70 mt-0.5" />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <a href={pr.pull_request?.html_url ?? pr.html_url} target="_blank" rel="noopener noreferrer"
            className="text-ink font-[500] hover:text-ink transition-colors text-sm leading-snug">
            {pr.title}
          </a>
          <span className="text-ink-soft text-xs tabular-nums">#{pr.number}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showAuthor && <span className="text-violet-600/70 text-xs font-[500]">@{pr.user.login}</span>}
          <span className="text-ink-soft text-xs font-mono truncate max-w-[180px]">{pr.repo}</span>
          <span className="text-ink-faint text-xs">·</span>
          <span className="text-ink-soft text-xs">{formatDate(pr.created_at)}</span>
          <StatusBadge pr={pr} />
          {pr.flagged && <FlagBadge flag={pr.flagged} />}
          {pr.approved && !pr.flagged && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-success-0 text-success-600 border border-success-100 whitespace-nowrap">✓ Approved</span>
          )}
        </div>
        {pr.flagged?.note && <p className="text-ink-soft text-xs mt-1 italic">Note: {pr.flagged.note}</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        {pr.flagged ? (
          onUnflag && (
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnflag(pr.prKey); }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid hover:bg-panel transition-all cursor-pointer">
              Unflag
            </button>
          )
        ) : pr.approved ? (
          onUnapprove && (
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnapprove(pr); }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid transition-all opacity-60 sm:opacity-0 group-hover:opacity-100 cursor-pointer">
              Undo
            </button>
          )
        ) : (
          <>
            {onApprove && (
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApprove(pr); }}
                title="Looks good — approve"
                className="text-xs px-2.5 py-1.5 rounded-lg bg-success-0 border border-success-100 text-success-600 hover:bg-success-500/20 transition-all opacity-60 sm:opacity-0 group-hover:opacity-100 cursor-pointer">
                ✓ Approve
              </button>
            )}
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFlag(pr); }}
              title="Flag this PR"
              className="text-xs px-2.5 py-1.5 rounded-lg bg-error-0 border border-error-100 text-error-600 hover:bg-error-500/20 transition-all opacity-60 sm:opacity-0 group-hover:opacity-100 cursor-pointer">
              ⚑ Flag
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Queue Tab ────────────────────────────────────────────────────────────────

interface QueueTabProps {
  students: string[];
  reviewedIds: Set<string>;
  flaggedMap: Map<string, FlaggedPR>;
  onFlag: (pr: PRWithMeta) => void;
  onApprove: (pr: PRWithMeta) => void;
  onUnapprove: (pr: PRWithMeta) => void;
  onUnflag: (prKey: string) => void;
  queuePRs: PRWithMeta[];
  setQueuePRs: React.Dispatch<React.SetStateAction<PRWithMeta[]>>;
}

function QueueTab({ students, reviewedIds, flaggedMap, onFlag, onApprove, onUnapprove, onUnflag, queuePRs, setQueuePRs }: QueueTabProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [queueFilter, setQueueFilter] = useState<'pending' | 'all'>('pending');

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    setProgress({ done: 0, total: 1 });

    try {
      const res = await fetch('/api/admin/queue');
      if (!res.ok) {
        throw new Error(`Failed to load queue: ${res.status}`);
      }
      const data = await res.json();
      const rawPRs: RawPR[] = data.prs ?? [];

      const all: PRWithMeta[] = rawPRs.map((pr) => {
        const repo = repoFromUrl(pr.repository_url);
        const prKey = `${repo}#${pr.number}`;
        return {
          ...pr,
          prKey,
          repo,
          isMerged: !!pr.pull_request?.merged_at,
          flagged: flaggedMap.get(prKey),
          approved: reviewedIds.has(prKey) && !flaggedMap.has(prKey),
        };
      });

      // Sort: pending first → approved → flagged, newest within each group
      all.sort((a, b) => {
        const priority = (pr: PRWithMeta) =>
          pr.flagged ? 2 : pr.approved ? 1 : 0;
        const pa = priority(a), pb = priority(b);
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setQueuePRs(all);
      setProgress({ done: data.stats?.cachedStudents ?? students.length, total: data.stats?.totalStudents ?? students.length });
    } catch (err: any) {
      setError(err.message || 'Failed to load queue');
    }

    setLoaded(true);
    setLoading(false);
  }, [students, reviewedIds, flaggedMap, setQueuePRs]);

  const pendingPRs = queuePRs.filter((pr) => !pr.approved && !pr.flagged);
  const displayPRs = queueFilter === 'pending' ? pendingPRs : queuePRs;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-ink font-[550]">PR Review Queue</h2>
          <p className="text-ink-soft text-sm mt-0.5">
            All contributor PRs — approve clean ones, flag bad ones.
          </p>
        </div>
        <button
          id="load-queue-btn"
          onClick={loadQueue}
          disabled={loading}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-[550] px-5 py-2.5 rounded-xl transition-all  flex items-center gap-2 text-sm"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading from cache…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loaded ? 'Refresh Queue' : 'Load Queue'}
            </>
          )}
        </button>
      </div>

      {/* Progress bar */}
      {loading && (
        <div className="mb-6">
          <div className="w-full h-1.5 bg-panel rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all duration-300 rounded-full"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-ink-soft text-xs mt-2">Fetching PRs from GitHub… ({progress.done}/{progress.total} contributors)</p>
        </div>
      )}

      {error && (
        <div className="bg-error-0 border border-error-100 rounded-xl p-4 text-error-600 text-sm mb-6">{error}</div>
      )}

      {/* Stats strip */}
      {loaded && !loading && (
        <div className="flex flex-wrap gap-3 mb-5">
          {[
            { label: 'Pending Review', value: pendingPRs.length, color: 'text-gold-600', bg: 'bg-gold-0', border: 'border-gold-100' },
            { label: 'Approved', value: queuePRs.filter(p => p.approved).length, color: 'text-success-600', bg: 'bg-success-0', border: 'border-success-100' },
            { label: 'Flagged', value: queuePRs.filter(p => p.flagged).length, color: 'text-error-600', bg: 'bg-error-0', border: 'border-error-100' },
            { label: 'Total PRs', value: queuePRs.length, color: 'text-ink-soft', bg: 'bg-white', border: 'border-line' },
          ].map((s) => (
            <div key={s.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${s.bg} ${s.border}`}>
              <span className={`text-xl font-[650] tabular-nums ${s.color}`}>{s.value}</span>
              <span className="text-ink-soft text-xs">{s.label}</span>
            </div>
          ))}

          {/* Filter toggle */}
          <div className="flex gap-1 ml-auto bg-white border border-line rounded-xl p-1">
            {(['pending', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setQueueFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-[500] transition-all capitalize ${
                  queueFilter === f ? 'bg-panel text-ink' : 'text-ink-soft hover:text-ink-mid'
                }`}>
                {f === 'pending' ? `⏳ Pending (${pendingPRs.length})` : `All (${queuePRs.length})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loaded && !loading && (
        <div className="text-center py-24 text-ink-soft">
          <div className="text-5xl mb-4">📥</div>
          <p className="text-base font-[500] text-ink-soft mb-1">Queue not loaded yet</p>
          <p className="text-sm">Click &quot;Load Queue&quot; to fetch all contributor PRs from server cache</p>
        </div>
      )}

      {loaded && !loading && displayPRs.length === 0 && (
        <div className="text-center py-24 text-ink-soft">
          <div className="text-5xl mb-4">🎉</div>
          <p className="text-base font-[500] text-ink-soft mb-1">All caught up!</p>
          <p className="text-sm">No pending PRs to review</p>
        </div>
      )}

      {/* PR list */}
      <div className="space-y-2">
        {displayPRs.map((pr) => (
          <PRRow
            key={pr.prKey}
            pr={pr}
            showAuthor
            onApprove={onApprove}
            onFlag={onFlag}
            onUnflag={onUnflag}
            onUnapprove={onUnapprove}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

interface Props {
  flaggedPRs: FlaggedPR[];
  reviewedPRIds: string[];
  students: string[];
}

type DashboardTab = 'queue' | 'browse' | 'flagged' | 'students' | 'events' | 'achievers' | 'requests' | 'ownRepos';

export default function AdminDashboardClient({ flaggedPRs: initialFlagged, reviewedPRIds: initialReviewed, students }: Props) {
  const router = useRouter();

  const [tab, setTab] = useState<DashboardTab>('queue');
  const [pendingReqCount, setPendingReqCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/join-requests')
      .then(res => res.json())
      .then((data: any[]) => {
        setPendingReqCount(data.filter(r => r.status === 'pending').length);
      })
      .catch(() => {});
  }, []);

  const [selectedUser, setSelectedUser] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [browsePRs, setBrowsePRs] = useState<PRWithMeta[]>([]);
  const [queuePRs, setQueuePRs] = useState<PRWithMeta[]>([]);
  const [flaggedMap, setFlaggedMap] = useState<Map<string, FlaggedPR>>(
    () => new Map(initialFlagged.map((f) => [f.id, f]))
  );
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(
    () => new Set(initialReviewed)
  );
  const [allFlagged, setAllFlagged] = useState<FlaggedPR[]>(initialFlagged);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [modalPR, setModalPR] = useState<PRWithMeta | null>(null);
  const [browseFilter, setBrowseFilter] = useState<'all' | 'flagged' | 'clean'>('all');
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Sync search input query with selected contributor
  useEffect(() => {
    setSearchQuery(selectedUser);
  }, [selectedUser]);

  // Pending count for tab badge
  const pendingCount = queuePRs.filter((pr) => !pr.approved && !pr.flagged).length;

  const applyMeta = useCallback((prs: PRWithMeta[]) =>
    prs.map((pr) => ({
      ...pr,
      flagged: flaggedMap.get(pr.prKey),
      approved: reviewedIds.has(pr.prKey) && !flaggedMap.has(pr.prKey),
    })), [flaggedMap, reviewedIds]);

  // Keep queue PRs in sync when flaggedMap/reviewedIds change
  useEffect(() => {
    setQueuePRs((prev) => applyMeta(prev));
  }, [flaggedMap, reviewedIds, applyMeta]);

  // ── Shared actions ──

  function handleFlagged(pr: PRWithMeta, reason: FlagReason, note: string) {
    const entry: FlaggedPR = {
      id: pr.prKey,
      url: pr.pull_request?.html_url ?? pr.html_url,
      title: pr.title,
      author: pr.user.login,
      reason,
      note: note.trim() || undefined,
      flaggedAt: new Date().toISOString(),
    };
    setFlaggedMap((prev) => new Map(prev).set(pr.prKey, entry));
    setReviewedIds((prev) => new Set([...prev, pr.prKey]));
    setAllFlagged((prev) => [...prev.filter((f) => f.id !== pr.prKey), entry]);
    setBrowsePRs((prev) => applyMeta(prev));
  }

  async function handleApprove(pr: PRWithMeta) {
    const res = await fetch('/api/admin/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pr.prKey }),
    });
    if (res.ok) {
      setReviewedIds((prev) => new Set([...prev, pr.prKey]));
    }
  }

  async function handleUnapprove(pr: PRWithMeta) {
    const res = await fetch(`/api/admin/approve?id=${encodeURIComponent(pr.prKey)}`, { method: 'DELETE' });
    if (res.ok) {
      setReviewedIds((prev) => { const s = new Set(prev); s.delete(pr.prKey); return s; });
    }
  }

  async function handleUnflag(prKey: string) {
    const res = await fetch(`/api/admin/flag?id=${encodeURIComponent(prKey)}`, { method: 'DELETE' });
    if (res.ok) {
      setFlaggedMap((prev) => { const m = new Map(prev); m.delete(prKey); return m; });
      setReviewedIds((prev) => { const s = new Set(prev); s.delete(prKey); return s; });
      setAllFlagged((prev) => prev.filter((f) => f.id !== prKey));
    }
  }

  async function fetchBrowsePRs(username: string) {
    if (!username) return;
    setBrowseLoading(true);
    setBrowseError('');
    setBrowsePRs([]);
    try {
      const raw = await fetchPRsForUser(username);
      if (raw.length === 0 && username) {
        setBrowseError('No PRs found or GitHub rate limit hit.');
      }
      const mapped: PRWithMeta[] = raw.map((pr) => {
        const repo = repoFromUrl(pr.repository_url);
        const prKey = `${repo}#${pr.number}`;
        return { ...pr, prKey, repo, isMerged: !!pr.pull_request?.merged_at, flagged: flaggedMap.get(prKey), approved: reviewedIds.has(prKey) && !flaggedMap.has(prKey) };
      });
      setBrowsePRs(mapped);
    } catch {
      setBrowseError('Network error while fetching PRs.');
    } finally {
      setBrowseLoading(false);
    }
  }

  async function handleLogout() {
    setLogoutLoading(true);
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin');
  }

  const displayedBrowsePRs = browsePRs.filter((pr) => {
    if (browseFilter === 'flagged') return !!pr.flagged;
    if (browseFilter === 'clean') return !pr.flagged;
    return true;
  });

  return (
    <main className="min-h-screen bg-panel">
      {/* Glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-100/30 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative border-b border-line bg-panel/80 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-0 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="text-ink font-[550] text-sm">Admin Dashboard</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-ink-soft text-xs hidden sm:inline">{allFlagged.length} flagged</span>
            <button onClick={handleLogout} disabled={logoutLoading} id="admin-logout-btn"
              className="text-ink-soft hover:text-ink-mid text-sm px-3 py-1.5 rounded-lg hover:bg-panel border border-transparent hover:border-line transition-all flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {logoutLoading ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-8 bg-white border border-line rounded-xl p-1 w-fit">
          {([
            { id: 'queue',    label: '📥 Queue',    badge: pendingCount > 0 ? pendingCount : null },
            { id: 'requests', label: '📨 Requests', badge: pendingReqCount && pendingReqCount > 0 ? pendingReqCount : null },
            { id: 'browse',   label: '🔍 Browse',   badge: null },
            { id: 'flagged',  label: '⚑ Flagged',  badge: allFlagged.length > 0 ? allFlagged.length : null },
            { id: 'students', label: '👥 Students', badge: null },
            { id: 'events',   label: '📅 Events',   badge: null },
            { id: 'achievers',label: '🏆 Achievers',badge: null },
            { id: 'ownRepos', label: '🌱 Own-Repo PRs', badge: null },
          ] as const).map(({ id, label, badge }) => (
            <button key={id} id={`tab-${id}`} onClick={() => setTab(id as DashboardTab)}
              className={`relative px-4 py-2 rounded-lg text-sm font-[500] transition-all ${
                tab === id ? 'bg-panel text-ink border border-line-strong' : 'text-ink-soft hover:text-ink-mid'
              }`}>
              {label}
              {badge !== null && (
                <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-[650] flex items-center justify-center ${
                  id === 'queue' ? 'bg-gold-400 text-ink' : 'bg-error-500 text-white'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Queue Tab ── */}
        {tab === 'queue' && (
          <QueueTab
            students={students}
            reviewedIds={reviewedIds}
            flaggedMap={flaggedMap}
            onFlag={(pr) => setModalPR(pr)}
            onApprove={handleApprove}
            onUnapprove={handleUnapprove}
            onUnflag={handleUnflag}
            queuePRs={queuePRs}
            setQueuePRs={setQueuePRs}
          />
        )}

        {/* ── Browse Tab ── */}
        {tab === 'browse' && (
          <div>
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-ink-soft mb-1.5 uppercase tracking-wider">Select contributor</label>
                <div className="relative">
                  <input
                    type="text"
                    id="user-select-search"
                    placeholder="Search and select contributor..."
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      setIsDropdownOpen(true);
                      if (students.includes(val)) {
                        setSelectedUser(val);
                      } else {
                        setSelectedUser('');
                      }
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    className="w-full bg-white border border-line rounded-xl pl-4 pr-14 py-2.5 text-ink text-sm focus:outline-none focus:border-violet-100 cursor-text"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedUser('');
                        setBrowsePRs([]);
                      }}
                      className="absolute right-9 top-3.5 text-ink-soft hover:text-ink-soft transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <div
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="absolute right-3 top-3 text-ink-soft hover:text-ink-mid cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {isDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                      <div className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white border border-line-strong rounded-xl shadow-2xl z-20 scrollbar-thin">
                        {students.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                          students
                            .filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map((s) => (
                              <div
                                key={s}
                                onClick={() => {
                                  setSelectedUser(s);
                                  setSearchQuery(s);
                                  setIsDropdownOpen(false);
                                }}
                                className={`px-4 py-2.5 text-sm text-ink cursor-pointer hover:bg-panel hover:text-ink transition-all ${
                                  selectedUser === s ? 'bg-violet-0 text-violet-600 font-[500]' : ''
                                }`}
                              >
                                {s}
                              </div>
                            ))
                        ) : (
                          <div className="px-4 py-3 text-xs text-ink-soft text-center">
                            No contributors match search.
                            <button
                              onClick={() => {
                                setTab('students');
                                setIsDropdownOpen(false);
                              }}
                              className="block mx-auto mt-1.5 text-violet-600 hover:text-violet-500 underline font-[500] cursor-pointer"
                            >
                              Add student to track list
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-end">
                <button id="load-prs-btn" onClick={() => fetchBrowsePRs(selectedUser)} disabled={browseLoading || !selectedUser}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-[550] px-6 py-2.5 rounded-xl transition-all  flex items-center gap-2 text-sm cursor-pointer">
                  {browseLoading ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Loading…</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Load PRs</>
                  )}
                </button>
              </div>
              {browsePRs.length > 0 && (
                <div className="flex items-end gap-1">
                  {(['all', 'clean', 'flagged'] as const).map((f) => (
                    <button key={f} onClick={() => setBrowseFilter(f)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-[500] border transition-all capitalize ${
                        browseFilter === f ? 'bg-panel text-ink border-line-strong' : 'bg-white text-ink-soft border-line hover:text-ink-mid'
                      }`}>
                      {f === 'all' ? `All (${browsePRs.length})` : f === 'flagged' ? `Flagged (${browsePRs.filter(p => p.flagged).length})` : `Clean (${browsePRs.filter(p => !p.flagged).length})`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {browseError && <div className="bg-error-0 border border-error-100 rounded-xl p-4 text-error-600 text-sm mb-6">{browseError}</div>}

            {!browseLoading && browsePRs.length === 0 && !browseError && (
              <div className="text-center py-20 text-ink-soft animate-in fade-in duration-300">
                <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {!selectedUser ? (
                  <>
                    <p className="text-base font-[500] text-ink-soft mb-1">No contributor selected</p>
                    <p className="text-sm">Search and select a tracked contributor from the dropdown above, or add a new student under the <strong>Students</strong> tab.</p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-[500] text-ink-soft mb-1">Contributor selected: @{selectedUser}</p>
                    <p className="text-sm">Click "Load PRs" to fetch their pull requests from GitHub.</p>
                  </>
                )}
              </div>
            )}

            {browseLoading && (
              <div className="text-center py-20 text-ink-soft flex flex-col items-center gap-3">
                <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Fetching PRs from GitHub…
              </div>
            )}

            <div className="space-y-2">
              {displayedBrowsePRs.map((pr) => (
                <PRRow key={pr.prKey} pr={pr}
                  onApprove={handleApprove}
                  onFlag={(p) => setModalPR(p)}
                  onUnflag={handleUnflag}
                  onUnapprove={handleUnapprove}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Flagged Tab ── */}
        {tab === 'flagged' && (
          <div>
            <p className="text-ink-soft text-sm mb-6">These PRs are excluded from contribution counts across all views.</p>

            {allFlagged.length === 0 ? (
              <div className="text-center py-20 text-ink-soft">
                <div className="text-5xl mb-3">🏳️</div>
                <p>No flagged PRs yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allFlagged.map((flag) => {
                  const meta = REASON_LABELS[flag.reason];
                  return (
                    <div key={flag.id} className="flex items-start gap-4 bg-white border border-line rounded-xl p-4 hover:bg-white transition-all">
                      <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border font-[500] ${meta.bg} ${meta.color} ${meta.border}`}>
                        {meta.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <a href={flag.url} target="_blank" rel="noopener noreferrer"
                          className="text-ink-mid text-sm font-[500] hover:text-ink transition-colors block">{flag.title}</a>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-ink-soft text-xs">@{flag.author}</span>
                          <span className="text-ink-faint text-xs">·</span>
                          <span className="text-ink-soft text-xs font-mono">{flag.id}</span>
                          <span className="text-ink-faint text-xs">·</span>
                          <span className="text-ink-soft text-xs">{formatDate(flag.flaggedAt)}</span>
                        </div>
                        {flag.note && <p className="text-ink-soft text-xs mt-1 italic">"{flag.note}"</p>}
                      </div>
                      <button onClick={() => handleUnflag(flag.id)}
                        className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid hover:bg-panel transition-all">
                        Unflag
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* ── Students Tab ── */}
        {tab === 'students' && <StudentsTab />}

        {/* ── Events Tab ── */}
        {tab === 'events' && <EventsTab />}

        {/* ── Achievers Tab ── */}
        {tab === 'achievers' && <AchieversTab />}

        {/* ── Requests Tab ── */}
        {tab === 'requests' && <RequestsTab onCountChange={setPendingReqCount} />}

        {/* ── Own-Repo Exceptions Tab ── */}
        {tab === 'ownRepos' && <OwnReposTab />}
      </div>

      {/* Flag modal */}
      {modalPR && (
        <FlagModal pr={modalPR} onClose={() => setModalPR(null)} onFlagged={handleFlagged} />
      )}
    </main>
  );
}

// ─── Students Tab ─────────────────────────────────────────────────────────────

interface Student {
  github: string;
  year?: '1st year' | '2nd year' | '3rd year' | '4th year';
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA';
}

function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGithub, setNewGithub] = useState('');
  const [newYear, setNewYear] = useState<'1st year' | '2nd year' | '3rd year' | '4th year' | ''>('');
  const [newCampus, setNewCampus] = useState<'Rishihood' | 'ADYPU' | 'SVYASA' | ''>('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editing state
  const [editingGithub, setEditingGithub] = useState<string | null>(null);
  const [editYear, setEditYear] = useState<'1st year' | '2nd year' | '3rd year' | '4th year' | ''>('');
  const [editCampus, setEditCampus] = useState<'Rishihood' | 'ADYPU' | 'SVYASA' | ''>('');
  const [saving, setSaving] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterCampus, setFilterCampus] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState(50);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/students');
    if (res.ok) {
      const data = await res.json();
      setStudents(data);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newGithub.trim()) return;
    setAdding(true); setError(''); setSuccess('');
    const res = await fetch('/api/admin/students', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        github: newGithub.trim(),
        year: newYear || undefined,
        campus: newCampus || undefined
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setSuccess(`@${newGithub.trim()} added!`);
      setNewGithub('');
      setNewYear('');
      setNewCampus('');
      await load();
    }
    else setError(data.error ?? 'Failed to add');
    setAdding(false);
  }

  function startEdit(student: Student) {
    setEditingGithub(student.github);
    setEditYear(student.year || '');
    setEditCampus(student.campus || '');
  }

  async function executeUpdate(github: string) {
    setSaving(true);
    setError(''); setSuccess('');
    const res = await fetch('/api/admin/students', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        github,
        year: editYear || undefined,
        campus: editCampus || undefined
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSuccess(`Updated @${github}`);
      setEditingGithub(null);
      await load();
    } else {
      setError('Failed to update student details');
    }
  }

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function executeRemove(github: string) {
    setConfirmRemove(null);
    setError(''); setSuccess('');
    const res = await fetch(`/api/admin/students?github=${encodeURIComponent(github)}`, { method: 'DELETE' });
    if (res.ok) { setSuccess(`@${github} removed.`); await load(); }
    else setError('Failed to remove');
  }

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch = s.github.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchesYear = !filterYear || s.year === filterYear;
      const matchesCampus = !filterCampus || s.campus === filterCampus;
      return matchesSearch && matchesYear && matchesCampus;
    });
  }, [students, searchQuery, filterYear, filterCampus]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-ink font-[550]">Tracked Students</h2>
        <p className="text-ink-soft text-sm mt-0.5">Add or remove GitHub usernames and assign year/campus labels.</p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-3 mb-6">
        <input type="text" value={newGithub} onChange={(e) => setNewGithub(e.target.value)}
          placeholder="GitHub username" id="new-student-input"
          className="flex-1 bg-white border border-line rounded-xl px-4 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
        
        <select value={newYear} onChange={(e) => setNewYear(e.target.value as any)}
          className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink text-sm focus:outline-none focus:border-violet-100 cursor-pointer">
          <option value="">Select Year</option>
          <option value="1st year">1st Year</option>
          <option value="2nd year">2nd Year</option>
          <option value="3rd year">3rd Year</option>
          <option value="4th year">4th Year</option>
        </select>

        <select value={newCampus} onChange={(e) => setNewCampus(e.target.value as any)}
          className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink text-sm focus:outline-none focus:border-violet-100 cursor-pointer">
          <option value="">Select Campus</option>
          <option value="Rishihood">Rishihood</option>
          <option value="ADYPU">ADYPU</option>
          <option value="SVYASA">SVYASA</option>
        </select>

        <button type="submit" disabled={adding || !newGithub.trim()} id="add-student-btn"
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-[550] px-5 py-2.5 rounded-xl transition-all text-sm cursor-pointer">
          {adding ? 'Adding…' : '+ Add'}
        </button>
      </form>

      {/* ── Search & Filter Bar ── */}
      <div className="flex flex-col md:flex-row gap-3 mb-4 bg-white border border-line rounded-xl p-4 animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(50);
            }}
            placeholder="Search student by GitHub username..."
            className="w-full bg-white border border-line rounded-xl pl-9 pr-4 py-2 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100"
          />
          <span className="absolute left-3 top-2.5 text-ink-soft text-sm">🔎</span>
        </div>

        <select
          value={filterYear}
          onChange={(e) => {
            setFilterYear(e.target.value);
            setVisibleCount(50);
          }}
          className="bg-white border border-line rounded-xl px-3 py-2 text-ink text-sm focus:outline-none focus:border-violet-100 cursor-pointer"
        >
          <option value="">All Years</option>
          <option value="1st year">1st Year</option>
          <option value="2nd year">2nd Year</option>
          <option value="3rd year">3rd Year</option>
          <option value="4th year">4th Year</option>
        </select>

        <select
          value={filterCampus}
          onChange={(e) => {
            setFilterCampus(e.target.value);
            setVisibleCount(50);
          }}
          className="bg-white border border-line rounded-xl px-3 py-2 text-ink text-sm focus:outline-none focus:border-violet-100 cursor-pointer"
        >
          <option value="">All Campuses</option>
          <option value="Rishihood">Rishihood</option>
          <option value="ADYPU">ADYPU</option>
          <option value="SVYASA">SVYASA</option>
        </select>

        {(searchQuery || filterYear || filterCampus) && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilterYear('');
              setFilterCampus('');
              setVisibleCount(50);
            }}
            className="text-xs px-4 py-2 rounded-xl bg-panel border border-line text-ink-mid hover:text-ink transition-all cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="flex justify-between items-center mb-4 text-xs text-ink-soft px-1">
        <p>Showing {Math.min(filteredStudents.length, visibleCount)} of {filteredStudents.length} students {filteredStudents.length !== students.length && `(filtered from ${students.length})`}</p>
      </div>

      {error && <p className="text-error-600 text-sm mb-4 bg-error-0 border border-error-100 rounded-xl px-4 py-2.5">{error}</p>}
      {success && <p className="text-success-600 text-sm mb-4 bg-success-0 border border-success-100 rounded-xl px-4 py-2.5">{success}</p>}

      {loading ? (
        <div className="text-center py-12 text-ink-soft">Loading…</div>
      ) : (
        <div className="space-y-2">
          {filteredStudents.slice(0, visibleCount).map((s) => {
            const isConfirming = confirmRemove === s.github;
            const isEditing = editingGithub === s.github;
            return (
              <div key={s.github} className="group flex flex-col gap-3 bg-white border border-line rounded-xl px-4 py-3 hover:bg-panel transition-all">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img src={`https://avatars.githubusercontent.com/${s.github}?s=32`} alt={s.github} className="w-8 h-8 rounded-full ring-1 ring-line" />
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-ink text-sm font-[500]">@{s.github}</p>
                        {s.year && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-0 text-violet-600 border border-violet-100 font-[550]">
                            {s.year}
                          </span>
                        )}
                        {s.campus && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-0 text-brand-600 border border-brand-100 font-[550]">
                            {s.campus}
                          </span>
                        )}
                      </div>
                      <a href={`https://github.com/${s.github}`} target="_blank" rel="noopener noreferrer" className="text-ink-soft text-xs hover:text-violet-600 transition-colors">github.com/{s.github}</a>
                    </div>
                  </div>
                  {isConfirming ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0 animate-in fade-in zoom-in-95 duration-150">
                      <span className="text-xs text-ink-soft mr-1 hidden xs:inline">Are you sure?</span>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); executeRemove(s.github); }}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-error-500 hover:bg-error-500 text-white font-[550] transition-all cursor-pointer ">
                        Delete
                      </button>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmRemove(null); }}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid transition-all cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" onClick={() => startEdit(s)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-panel border border-line text-ink-mid hover:text-ink hover:bg-panel transition-all opacity-60 sm:opacity-0 group-hover:opacity-100 cursor-pointer">
                        Edit
                      </button>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmRemove(s.github); }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-error-0 border border-error-100 text-error-600 hover:bg-error-500/20 transition-all opacity-60 sm:opacity-0 group-hover:opacity-100 cursor-pointer">
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-line animate-in slide-in-from-top-2 duration-150">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-[550] text-ink-soft uppercase tracking-wider">Year</span>
                      <select value={editYear} onChange={(e) => setEditYear(e.target.value as any)}
                        className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-ink text-xs focus:outline-none focus:border-violet-100 cursor-pointer">
                        <option value="">None</option>
                        <option value="1st year">1st Year</option>
                        <option value="2nd year">2nd Year</option>
                        <option value="3rd year">3rd Year</option>
                        <option value="4th year">4th Year</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-[550] text-ink-soft uppercase tracking-wider">Campus</span>
                      <select value={editCampus} onChange={(e) => setEditCampus(e.target.value as any)}
                        className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-ink text-xs focus:outline-none focus:border-violet-100 cursor-pointer">
                        <option value="">None</option>
                        <option value="Rishihood">Rishihood</option>
                        <option value="ADYPU">ADYPU</option>
                        <option value="SVYASA">SVYASA</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-1.5 h-full pt-5">
                      <button type="button" onClick={() => executeUpdate(s.github)} disabled={saving}
                        className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-[550] transition-all cursor-pointer">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={() => setEditingGithub(null)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid transition-all cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredStudents.length === 0 && <div className="text-center py-12 text-ink-soft">No matching students found.</div>}
          {filteredStudents.length > visibleCount && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 100)}
                className="bg-panel border border-line hover:bg-panel text-ink hover:text-ink px-6 py-2.5 rounded-xl text-sm font-[550] transition-all cursor-pointer"
              >
                Load More (+100)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Own-Repo Exceptions Tab ────────────────────────────────────────────────
// Self-authored PRs into a student's own repos are excluded from scoring by
// default (closes the trivial "make a repo, merge your own PRs" gaming
// vector). This is the one deliberate exception: a student who's built a
// genuinely used open source project can share it with an admin, who reviews
// it personally and adds it here. Not gated on stars/forks — in a small,
// socially-connected student community, those are easy to coordinate around
// (ask a few friends to star+fork), so a human actually looking at the
// project is the only check that can't be gamed that way.
interface OwnRepoException {
  username: string;
  repo: string;
  addedAt: string;
  note?: string;
}

function OwnReposTab() {
  const [exceptions, setExceptions] = useState<OwnRepoException[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/own-repos');
    if (res.ok) setExceptions(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || !newRepo.trim()) return;
    setAdding(true); setError(''); setSuccess('');
    const res = await fetch('/api/admin/own-repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername.trim(), repo: newRepo.trim(), note: newNote.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSuccess(`Approved ${newRepo.trim()} for @${newUsername.trim()}`);
      setNewUsername(''); setNewRepo(''); setNewNote('');
      await load();
    } else {
      setError(data.error ?? 'Failed to add exception');
    }
    setAdding(false);
  }

  async function executeRemove(username: string, repo: string) {
    setConfirmRemove(null);
    setError(''); setSuccess('');
    const res = await fetch(`/api/admin/own-repos?username=${encodeURIComponent(username)}&repo=${encodeURIComponent(repo)}`, { method: 'DELETE' });
    if (res.ok) { setSuccess(`Revoked ${repo} for @${username}`); await load(); }
    else setError('Failed to remove exception');
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-ink font-[550]">Own-Repo PR Exceptions</h2>
        <p className="text-ink-soft text-sm mt-0.5">
          By default, a student&apos;s own-repo PRs never count toward their score. Add a specific repo here — after actually
          reviewing the project — to let that one student&apos;s self-authored merged PRs into that one repo count.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-3 mb-6">
        <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
          placeholder="GitHub username" id="new-own-repo-username"
          className="flex-1 bg-white border border-line rounded-xl px-4 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />

        <input type="text" value={newRepo} onChange={(e) => setNewRepo(e.target.value)}
          placeholder="owner/repo (e.g. octocat/hello-world)" id="new-own-repo-name"
          className="flex-1 bg-white border border-line rounded-xl px-4 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />

        <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)}
          placeholder="Note (optional)" id="new-own-repo-note"
          className="flex-1 bg-white border border-line rounded-xl px-4 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />

        <button type="submit" disabled={adding || !newUsername.trim() || !newRepo.trim()} id="add-own-repo-btn"
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-[550] px-5 py-2.5 rounded-xl transition-all text-sm cursor-pointer whitespace-nowrap">
          {adding ? 'Adding…' : '+ Approve'}
        </button>
      </form>

      {error && <div className="mb-4 text-error-600 text-sm bg-error-0 border border-error-100 rounded-xl px-4 py-2.5">{error}</div>}
      {success && <div className="mb-4 text-success-600 text-sm bg-success-0 border border-success-100 rounded-xl px-4 py-2.5">{success}</div>}

      {loading ? (
        <div className="text-ink-soft text-sm py-8 text-center">Loading…</div>
      ) : exceptions.length === 0 ? (
        <div className="text-ink-soft text-sm py-12 text-center border border-line rounded-2xl bg-white">
          No exceptions yet — nothing counts from a student&apos;s own repos until you add one here.
        </div>
      ) : (
        <div className="space-y-2">
          {exceptions.map((e) => {
            const key = `${e.username}::${e.repo}`;
            return (
              <div key={key} className="flex items-center justify-between gap-4 bg-white border border-line rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm text-ink">
                    <span className="font-[550]">@{e.username}</span>
                    <span className="text-ink-soft mx-1.5">→</span>
                    <span className="text-violet-600/90 font-mono text-xs">{e.repo}</span>
                  </div>
                  {e.note && <div className="text-ink-soft text-xs mt-1">{e.note}</div>}
                  <div className="text-ink-soft text-[10px] mt-1">Added {new Date(e.addedAt).toLocaleDateString()}</div>
                </div>
                {confirmRemove === key ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => executeRemove(e.username, e.repo)}
                      className="text-error-600 hover:text-error-600 text-xs font-[550] px-3 py-1.5 rounded-lg bg-error-0 hover:bg-error-500/20 transition-all cursor-pointer">
                      Confirm revoke
                    </button>
                    <button onClick={() => setConfirmRemove(null)}
                      className="text-ink-soft hover:text-ink-mid text-xs px-3 py-1.5 rounded-lg hover:bg-panel transition-all cursor-pointer">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmRemove(key)}
                    className="text-ink-soft hover:text-error-600 text-xs px-3 py-1.5 rounded-lg hover:bg-error-0 transition-all cursor-pointer shrink-0">
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Events Tab ───────────────────────────────────────────────────────────────

interface EventItem { id: string; title: string; date: string; type: string; description: string; link?: string; }

function EventsTab() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ title: '', date: '', type: 'session', description: '', link: '' });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<EventItem>>({});

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/events');
    if (res.ok) setEvents(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.type) return;
    setAdding(true); setError(''); setSuccess('');
    const res = await fetch('/api/admin/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, title: form.title.trim(), description: form.description.trim(), link: form.link.trim() || undefined }),
    });
    if (res.ok) { setSuccess('Event added!'); setForm({ title: '', date: '', type: 'session', description: '', link: '' }); await load(); }
    else { const d = await res.json(); setError(d.error ?? 'Failed'); }
    setAdding(false);
  }

  async function executeDeleteEvent(id: string) {
    setConfirmDeleteId(null);
    setError(''); setSuccess('');
    const res = await fetch(`/api/admin/events?id=${id}`, { method: 'DELETE' });
    if (res.ok) { setSuccess('Event deleted.'); await load(); }
    else setError('Failed to delete');
  }

  async function handleSaveEdit(id: string) {
    const res = await fetch('/api/admin/events', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    });
    if (res.ok) { setSuccess('Event updated.'); setEditId(null); await load(); }
    else setError('Failed to update');
  }

  const EVENT_TYPES = ['session', 'deadline', 'announcement'];
  const TYPE_COLORS: Record<string, string> = {
    session: 'text-brand-600 bg-brand-0 border-brand-100',
    deadline: 'text-error-600 bg-error-0 border-error-100',
    announcement: 'text-gold-600 bg-gold-0 border-gold-100',
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-ink font-[550]">Upcoming Events</h2>
        <p className="text-ink-soft text-sm mt-0.5">Manage sessions, deadlines, and announcements shown on the home page.</p>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white border border-line rounded-2xl p-5 mb-6 space-y-3">
        <p className="text-ink-soft text-xs font-[550] uppercase tracking-wider">New Event</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title *" required
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
          <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} required
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink-mid text-sm focus:outline-none focus:border-violet-100 " />
          <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink-mid text-sm focus:outline-none focus:border-violet-100">
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.link} onChange={(e) => setForm(f => ({ ...f, link: e.target.value }))} placeholder="Link (optional)"
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
        </div>
        <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description"
          className="w-full bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
        <button type="submit" disabled={adding || !form.title.trim() || !form.date}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-[550] px-5 py-2 rounded-xl text-sm transition-all">
          {adding ? 'Adding…' : '+ Add Event'}
        </button>
      </form>

      {error && <p className="text-error-600 text-sm mb-4 bg-error-0 border border-error-100 rounded-xl px-4 py-2.5">{error}</p>}
      {success && <p className="text-success-600 text-sm mb-4 bg-success-0 border border-success-100 rounded-xl px-4 py-2.5">{success}</p>}

      {loading ? <div className="text-center py-12 text-ink-soft">Loading…</div> : (
        <div className="space-y-2">
          {events.map((ev) => editId === ev.id ? (
            <div key={ev.id} className="bg-white border border-violet-100 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={editForm.title ?? ev.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="bg-white border border-line rounded-xl px-3 py-2 text-ink text-sm focus:outline-none focus:border-violet-100" />
                <input type="date" value={editForm.date ?? ev.date} onChange={(e) => setEditForm(f => ({ ...f, date: e.target.value }))}
                  className="bg-white border border-line rounded-xl px-3 py-2 text-ink-mid text-sm focus:outline-none " />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSaveEdit(ev.id); }} className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-[550] rounded-lg transition-all cursor-pointer">Save</button>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditId(null); }} className="px-4 py-1.5 bg-white text-ink-soft hover:text-ink-mid text-xs rounded-lg border border-line transition-all cursor-pointer">Cancel</button>
              </div>
            </div>
          ) : (
            <div key={ev.id} className="group flex items-start justify-between gap-4 bg-white border border-line rounded-xl px-4 py-3 hover:bg-panel transition-all">
              <div className="flex items-start gap-3 min-w-0">
                <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border whitespace-nowrap mt-0.5 ${TYPE_COLORS[ev.type] ?? 'text-ink-soft bg-panel border-line'}`}>{ev.type}</span>
                <div className="min-w-0">
                  <p className="text-ink text-sm font-[500]">{ev.title}</p>
                  <p className="text-ink-soft text-xs">{ev.date}{ev.description ? ` · ${ev.description}` : ''}</p>
                </div>
              </div>
              {confirmDeleteId === ev.id ? (
                <div className="flex items-center gap-1.5 flex-shrink-0 animate-in fade-in zoom-in-95 duration-150">
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); executeDeleteEvent(ev.id); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-error-500 hover:bg-error-500 text-white font-[550] transition-all cursor-pointer ">Delete</button>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(null); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid transition-all cursor-pointer">Cancel</button>
                </div>
              ) : (
                <div className="flex gap-1.5 flex-shrink-0 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-all">
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditId(ev.id); setEditForm({}); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid transition-all cursor-pointer">Edit</button>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(ev.id); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-error-0 border border-error-100 text-error-600 hover:bg-error-500/20 transition-all cursor-pointer">Delete</button>
                </div>
              )}
            </div>
          ))}
          {events.length === 0 && <div className="text-center py-12 text-ink-soft">No events yet.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Achievers Tab ────────────────────────────────────────────────────────────

interface AchieverEntry { github: string; name?: string; programs: Array<{ name: string; year?: number; org?: string; url?: string }>; }

const PROGRAM_OPTIONS = ['GSoC', 'LFX', 'Outreachy', 'Summer of Bitcoin', 'ESoC', 'MLH', 'Hacktoberfest'];

function AchieversTab() {
  const [achievers, setAchievers] = useState<AchieverEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ github: '', name: '', programName: 'GSoC', year: new Date().getFullYear().toString(), org: '', url: '' });
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/achievers');
    if (res.ok) setAchievers(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.github.trim() || !form.programName) return;
    setAdding(true); setError(''); setSuccess('');
    const res = await fetch('/api/admin/achievers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        github: form.github.trim(),
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        programs: [{
          name: form.programName,
          ...(form.year ? { year: parseInt(form.year) } : {}),
          ...(form.org.trim() ? { org: form.org.trim() } : {}),
          ...(form.url.trim() ? { url: form.url.trim() } : {}),
        }],
      }),
    });
    if (res.ok) { setSuccess(`@${form.github.trim()} added to Hall of Fame!`); setForm({ github: '', name: '', programName: 'GSoC', year: new Date().getFullYear().toString(), org: '', url: '' }); await load(); }
    else { const d = await res.json(); setError(d.error ?? 'Failed'); }
    setAdding(false);
  }

  const [confirmDeleteGithub, setConfirmDeleteGithub] = useState<string | null>(null);

  async function executeDeleteAchiever(github: string) {
    setConfirmDeleteGithub(null);
    setError(''); setSuccess('');
    const res = await fetch(`/api/admin/achievers?github=${encodeURIComponent(github)}`, { method: 'DELETE' });
    if (res.ok) { setSuccess(`@${github} removed.`); await load(); }
    else setError('Failed to remove');
  }

  // ── Edit mode: lets an existing achiever have programs added/removed, or
  // their name fixed — the Add form above can only create a brand-new
  // person (rejects a duplicate GitHub username), so this is the only way
  // to give someone a second program (e.g. GSoC one year, LFX another)
  // without deleting and re-adding them from scratch.
  const [editingGithub, setEditingGithub] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrograms, setEditPrograms] = useState<AchieverEntry['programs']>([]);
  const [newProgram, setNewProgram] = useState({ programName: 'GSoC', year: new Date().getFullYear().toString(), org: '', url: '' });
  const [saving, setSaving] = useState(false);

  function startEdit(a: AchieverEntry) {
    setError(''); setSuccess('');
    setEditingGithub(a.github);
    setEditName(a.name ?? '');
    setEditPrograms([...a.programs]);
    setNewProgram({ programName: 'GSoC', year: new Date().getFullYear().toString(), org: '', url: '' });
  }

  function cancelEdit() {
    setEditingGithub(null);
  }

  function addProgramToEdit() {
    setEditPrograms(ps => [...ps, {
      name: newProgram.programName,
      ...(newProgram.year ? { year: parseInt(newProgram.year) } : {}),
      ...(newProgram.org.trim() ? { org: newProgram.org.trim() } : {}),
      ...(newProgram.url.trim() ? { url: newProgram.url.trim() } : {}),
    }]);
    setNewProgram({ programName: 'GSoC', year: new Date().getFullYear().toString(), org: '', url: '' });
  }

  function removeProgramFromEdit(idx: number) {
    setEditPrograms(ps => ps.filter((_, i) => i !== idx));
  }

  async function saveEdit(github: string) {
    if (editPrograms.length === 0) { setError('An achiever needs at least one program — remove the person instead if none apply.'); return; }
    setSaving(true); setError(''); setSuccess('');
    const res = await fetch('/api/admin/achievers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github, name: editName.trim() || undefined, programs: editPrograms }),
    });
    if (res.ok) { setSuccess(`@${github} updated.`); setEditingGithub(null); await load(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Failed to save'); }
    setSaving(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-ink font-[550]">Hall of Fame</h2>
        <p className="text-ink-soft text-sm mt-0.5">Add or remove students from the achievers list. Each student can have multiple programs — add them one at a time.</p>
      </div>

      <form onSubmit={handleAdd} className="bg-white border border-line rounded-2xl p-5 mb-6 space-y-3">
        <p className="text-ink-soft text-xs font-[550] uppercase tracking-wider">Add Achiever</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={form.github} onChange={(e) => setForm(f => ({ ...f, github: e.target.value }))} placeholder="GitHub username *" required
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
          <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name (optional)"
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
          <select value={form.programName} onChange={(e) => setForm(f => ({ ...f, programName: e.target.value }))}
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink-mid text-sm focus:outline-none focus:border-violet-100">
            {PROGRAM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={form.year} onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))} placeholder="Year" type="number" min="2010" max="2035"
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
          <input value={form.org} onChange={(e) => setForm(f => ({ ...f, org: e.target.value }))} placeholder="Organization (optional)"
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
          <input value={form.url} onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))} placeholder="Project URL (optional)"
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100" />
        </div>
        <button type="submit" disabled={adding || !form.github.trim()}
          className="bg-gold-400 disabled:opacity-40 text-ink font-[550] px-5 py-2 rounded-xl text-sm transition-all">
          {adding ? 'Adding…' : '+ Add to Hall of Fame'}
        </button>
      </form>

      {error && <p className="text-error-600 text-sm mb-4 bg-error-0 border border-error-100 rounded-xl px-4 py-2.5">{error}</p>}
      {success && <p className="text-success-600 text-sm mb-4 bg-success-0 border border-success-100 rounded-xl px-4 py-2.5">{success}</p>}

      {loading ? <div className="text-center py-12 text-ink-soft">Loading…</div> : (
        <div className="space-y-2">
          {achievers.map((a) => (
            editingGithub === a.github ? (
              <div key={a.github} className="bg-white border border-violet-100 rounded-xl px-4 py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <img src={`https://avatars.githubusercontent.com/${a.github}?s=32`} alt={a.github} className="w-8 h-8 rounded-full ring-1 ring-gold-100 flex-shrink-0" />
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={`@${a.github}`}
                    className="flex-1 bg-white border border-line rounded-xl px-3 py-2 text-ink text-sm focus:outline-none focus:border-violet-100" />
                </div>

                <div className="space-y-1.5">
                  {editPrograms.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 bg-panel rounded-lg px-3 py-1.5">
                      <span className="text-ink-mid text-xs">{p.name}{p.year ? ` ${p.year}` : ''}{p.org ? ` · ${p.org}` : ''}{p.url ? ` · has URL` : ''}</span>
                      <button type="button" onClick={() => removeProgramFromEdit(idx)}
                        className="text-error-600 text-xs hover:text-error-500 cursor-pointer flex-shrink-0">✕</button>
                    </div>
                  ))}
                  {editPrograms.length === 0 && <p className="text-ink-soft text-xs italic px-1">No programs — add at least one below before saving.</p>}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select value={newProgram.programName} onChange={(e) => setNewProgram(f => ({ ...f, programName: e.target.value }))}
                    className="bg-white border border-line rounded-lg px-2.5 py-2 text-ink-mid text-xs focus:outline-none focus:border-violet-100">
                    {PROGRAM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input value={newProgram.year} onChange={(e) => setNewProgram(f => ({ ...f, year: e.target.value }))} placeholder="Year" type="number" min="2010" max="2035"
                    className="bg-white border border-line rounded-lg px-2.5 py-2 text-ink text-xs focus:outline-none focus:border-violet-100" />
                  <input value={newProgram.org} onChange={(e) => setNewProgram(f => ({ ...f, org: e.target.value }))} placeholder="Org"
                    className="bg-white border border-line rounded-lg px-2.5 py-2 text-ink text-xs focus:outline-none focus:border-violet-100" />
                  <input value={newProgram.url} onChange={(e) => setNewProgram(f => ({ ...f, url: e.target.value }))} placeholder="Project URL"
                    className="bg-white border border-line rounded-lg px-2.5 py-2 text-ink text-xs focus:outline-none focus:border-violet-100" />
                </div>
                <button type="button" onClick={addProgramToEdit}
                  className="text-xs px-3 py-1.5 rounded-lg bg-panel border border-line-strong text-ink-mid hover:bg-panel-2 transition-all cursor-pointer">
                  + Add another program
                </button>

                <div className="flex items-center gap-2 pt-1 border-t border-panel">
                  <button type="button" disabled={saving} onClick={() => saveEdit(a.github)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gold-400 disabled:opacity-40 text-ink font-[550] transition-all cursor-pointer">
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button type="button" onClick={cancelEdit}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid transition-all cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
            <div key={a.github} className="group flex items-center justify-between gap-4 bg-white border border-line rounded-xl px-4 py-3 hover:bg-panel transition-all">
              <div className="flex items-center gap-3 min-w-0">
                <img src={`https://avatars.githubusercontent.com/${a.github}?s=32`} alt={a.github} className="w-8 h-8 rounded-full ring-1 ring-gold-100" />
                <div className="min-w-0">
                  <p className="text-ink text-sm font-[500]">{a.name ?? `@${a.github}`}</p>
                  <p className="text-ink-soft text-xs">{a.programs.map(p => `${p.name}${p.year ? ` ${p.year}` : ''}`).join(' · ')}</p>
                </div>
              </div>
              {confirmDeleteGithub === a.github ? (
                <div className="flex items-center gap-1.5 flex-shrink-0 animate-in fade-in zoom-in-95 duration-150">
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); executeDeleteAchiever(a.github); }}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-error-500 hover:bg-error-500 text-white font-[550] transition-all cursor-pointer ">
                    Remove
                  </button>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteGithub(null); }}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-line text-ink-soft hover:text-ink-mid transition-all cursor-pointer">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-shrink-0 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-all">
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEdit(a); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-panel border border-line-strong text-ink-mid hover:bg-panel-2 transition-all cursor-pointer">
                    Edit
                  </button>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteGithub(a.github); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-error-0 border border-error-100 text-error-600 hover:bg-error-500/20 transition-all cursor-pointer">
                    Remove
                  </button>
                </div>
              )}
            </div>
            )
          ))}
          {achievers.length === 0 && <div className="text-center py-12 text-ink-soft">No achievers yet.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Requests Tab ─────────────────────────────────────────────────────────────

interface JoinRequest {
  github: string;
  name?: string;
  avatarUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  year?: '1st year' | '2nd year' | '3rd year' | '4th year';
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA';
}

function RequestsTab({ onCountChange }: { onCountChange: (count: number) => void }) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/join-requests');
    if (res.ok) {
      const data = await res.json() as JoinRequest[];
      // Sort: pending first, then newest
      data.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setRequests(data);
      const pending = data.filter((r) => r.status === 'pending').length;
      onCountChange(pending);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAction(github: string, action: 'approve' | 'reject') {
    setProcessing(github);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/join-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github, action }),
      });
      if (res.ok) {
        setSuccess(`Successfully ${action === 'approve' ? 'approved' : 'rejected'} @${github}`);
        await load();
      } else {
        const d = await res.json();
        setError(d.error ?? `Failed to ${action} request`);
      }
    } catch {
      setError('Network error');
    } finally {
      setProcessing(null);
    }
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const historyRequests = requests.filter((r) => r.status !== 'pending');

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-ink font-[550]">Join Leaderboard Requests</h2>
        <p className="text-ink-soft text-sm mt-0.5">Approve or reject requests from students to be tracked on the leaderboard.</p>
      </div>

      {error && <p className="text-error-600 text-sm mb-4 bg-error-0 border border-error-100 rounded-xl px-4 py-2.5">{error}</p>}
      {success && <p className="text-success-600 text-sm mb-4 bg-success-0 border border-success-100 rounded-xl px-4 py-2.5">{success}</p>}

      {loading ? (
        <div className="text-center py-12 text-ink-soft">Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* Pending Queue */}
          <div className="space-y-3">
            <h3 className="text-ink-mid text-xs font-[550] uppercase tracking-wider">Pending Queue ({pendingRequests.length})</h3>
            <div className="space-y-2">
              {pendingRequests.map((r) => (
                <div key={r.github} className="flex items-center justify-between gap-4 bg-white border border-line rounded-xl px-4 py-3 hover:bg-panel transition-all">
                  <div className="flex items-center gap-3">
                    <img src={r.avatarUrl || `https://avatars.githubusercontent.com/${r.github}?s=32`} alt={r.github} className="w-8 h-8 rounded-full ring-1 ring-line" />
                    <div>
                      <p className="text-ink text-sm font-[500]">
                        {r.name && r.name !== r.github ? `${r.name} (@${r.github})` : `@${r.github}`}
                      </p>
                      <p className="text-ink-soft text-xs">Requested on {new Date(r.createdAt).toLocaleDateString()}</p>
                      {(r.year || r.campus) && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {r.year && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-0 text-violet-600 border border-violet-100 font-[550]">
                              {r.year}
                            </span>
                          )}
                          {r.campus && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-0 text-brand-600 border border-brand-100 font-[550]">
                              {r.campus}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={processing !== null}
                      onClick={() => handleAction(r.github, 'approve')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-success-0 border border-success-100 text-success-600 hover:bg-success-500/20 transition-all font-[550] disabled:opacity-50 cursor-pointer"
                    >
                      {processing === r.github ? '...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={processing !== null}
                      onClick={() => handleAction(r.github, 'reject')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-error-0 border border-error-100 text-error-600 hover:bg-error-500/20 transition-all font-[550] disabled:opacity-50 cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
              {pendingRequests.length === 0 && (
                <div className="text-center py-8 bg-white border border-line rounded-xl text-ink-soft text-sm">
                  No pending join requests.
                </div>
              )}
            </div>
          </div>

          {/* History */}
          {historyRequests.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-line">
              <h3 className="text-ink-mid text-xs font-[550] uppercase tracking-wider">Processed History</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
                {historyRequests.map((r) => (
                  <div key={r.github} className="flex items-center justify-between gap-4 bg-white border border-line rounded-xl px-4 py-2 text-ink-soft">
                    <div className="flex items-center gap-3">
                      <img src={r.avatarUrl || `https://avatars.githubusercontent.com/${r.github}?s=32`} alt={r.github} className="w-6 h-6 rounded-full opacity-60" />
                      <div>
                        <div className="text-xs">
                          <span className="font-[500] text-ink-mid">@{r.github}</span>
                          {r.name && r.name !== r.github && <span className="text-ink-soft ml-1">({r.name})</span>}
                        </div>
                        {(r.year || r.campus) && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {r.year && <span className="text-[8px] px-1 py-0.2 rounded bg-violet-0 text-violet-600 font-[500]">{r.year}</span>}
                            {r.campus && <span className="text-[8px] px-1 py-0.2 rounded bg-brand-0 text-brand-600 font-[500]">{r.campus}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-[650] uppercase ${
                        r.status === 'approved' ? 'bg-success-0 text-success-600' : 'bg-error-0 text-error-600'
                      }`}>
                        {r.status}
                      </span>
                      <span className="text-ink-soft">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

