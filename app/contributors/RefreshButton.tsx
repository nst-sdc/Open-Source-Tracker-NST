'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  cachedAt: string | null;
  username?: string;
  period?: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function RefreshButton({ cachedAt: initialCachedAt, username, period }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cachedAt, setCachedAt] = useState(initialCachedAt);
  const [label, setLabel] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' | 'warning'; loginNudge?: boolean } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // Sync state if props change
  useEffect(() => {
    setCachedAt(initialCachedAt);
  }, [initialCachedAt]);

  // Check if user is logged in to unlock unlimited refreshes
  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(data => { if (data.authenticated) setIsLoggedIn(true); setSessionChecked(true); })
      .catch(() => { setSessionChecked(true); });
  }, []);

  // Tick the "X ago" label every 30 seconds
  useEffect(() => {
    function update() {
      if (cachedAt) setLabel(timeAgo(cachedAt));
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [cachedAt]);

  // Auto-clear toast alert after 4 seconds (unless it is loading/info state)
  useEffect(() => {
    if (toast && toast.type !== 'info') {
      const id = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(id);
    }
  }, [toast]);

  async function handleRefresh() {
    setError('');
    setIsFetching(true);
    setToast({ message: 'Fetching latest data from GitHub...', type: 'info' });
    let url = '/api/refresh';
    if (username) {
      url = `/api/refresh?username=${encodeURIComponent(username)}`;
    } else if (period) {
      url = `/api/refresh?period=${encodeURIComponent(period)}`;
    }

    try {
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      // Handle specific HTTP error codes with clear messages
      if (!res.ok) {
        if (res.status === 404) {
          const msg = `GitHub profile @${username || 'unknown'} doesn't exist or was renamed.`;
          setToast({ message: msg, type: 'error' });
          setError(msg);
          setTimeout(() => { setError(''); }, 8000);
          return;
        }
        throw new Error(data.error || 'API request failed');
      }

      if (data.fromCache) {
        // Logged-in users should never get this — but handle gracefully just in case
        if (!isLoggedIn) {
          setCooldown(true);
          const msg = data.message || 'Data was refreshed recently. Try again in a few minutes.';
          setError(msg);
          setToast({ message: msg, type: 'error', loginNudge: true });
          setTimeout(() => { setCooldown(false); setError(''); }, 8000);
          return;
        }
      }
      if (data.rateLimited) {
        setToast({ message: data.message || 'GitHub rate limit exceeded. Profile queued for update.', type: 'warning' });
        setError(data.message || 'GitHub rate limit exceeded. Profile queued for update.');
        setTimeout(() => { setError(''); }, 8000);
        return;
      }
      if (data.cachedAt) setCachedAt(data.cachedAt);
      setToast({ message: 'Successfully updated leaderboard stats!', type: 'success' });
      // Re-render server components with fresh cache
      startTransition(() => { router.refresh(); });
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch updates. Please try again.';
      setToast({ message: msg, type: 'error' });
      setError(msg);
      setTimeout(() => { setError(''); }, 8000);
    } finally {
      setIsFetching(false);
    }
  }

  const isLoading = isPending || isFetching;
  const isDisabled = isLoading || (cooldown && !isLoggedIn);

  return (
    <div className="flex items-center gap-3">
      {/* Last updated label */}
      {cachedAt && (
        <span className="text-ink-soft text-xs flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-line-heavy inline-block" />
          Updated {label}
        </span>
      )}
      {!cachedAt && (
        <span className="text-ink-soft text-xs">No cache yet</span>
      )}

      {/* Refresh button — always enabled for logged-in users */}
      <button
        onClick={handleRefresh}
        disabled={isDisabled}
        id="public-refresh-btn"
        title={isLoggedIn ? 'Refresh anytime — you are logged in' : 'Fetch latest data from GitHub'}
        className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-xs font-[550] border transition-colors ${
          isLoading
            ? 'bg-brand-0 border-brand-100 text-brand-600 cursor-wait'
            : (cooldown && !isLoggedIn)
              ? 'bg-panel border-line text-ink-faint cursor-not-allowed'
              : isLoggedIn
                ? 'bg-brand-0 border-brand-100 text-brand-600 hover:bg-brand-100'
                : 'bg-ground border-line-strong text-ink-mid hover:text-ink hover:bg-panel hover:border-line-heavy'
        }`}
      >
        <svg
          className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {isLoading ? 'Refreshing…' : 'Refresh'}
      </button>

      {/* Logged-in unlock indicator */}
      {isLoggedIn && (
        <span className="text-brand-600 text-[10.5px] font-[600]">∞ unlimited</span>
      )}

      {/* Anon login nudge — always visible once session is confirmed not-logged-in */}
      {sessionChecked && !isLoggedIn && (
        <a
          href="/login"
          className="inline-flex items-center gap-1 text-[11px] font-[500] text-ink-soft hover:text-brand-600 transition-colors"
          title="Log in with GitHub for unlimited refreshes"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          Log in for unlimited
        </a>
      )}

      {/* Cooldown error (only shows for anonymous users) */}
      {error && !isLoggedIn && (
        <span className="text-warning-600 text-xs font-[500]">{error}</span>
      )}

      {/* Custom Premium Toast Alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-xl border border-line bg-ground shadow-pop text-xs max-w-xs transition-all duration-300">
          {toast.type === 'success' && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success-500"></span>
            </span>
          )}
          {toast.type === 'info' && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
          )}
          {toast.type === 'error' && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-error-500"></span>
            </span>
          )}
          {toast.type === 'warning' && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-gold-500"></span>
            </span>
          )}
          <span className="text-ink font-[550]">{toast.message}</span>
          {toast.loginNudge && (
            <a href="/login" className="ml-1 text-brand-600 hover:text-brand-500 underline underline-offset-2 transition-colors whitespace-nowrap">
              Log in →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
