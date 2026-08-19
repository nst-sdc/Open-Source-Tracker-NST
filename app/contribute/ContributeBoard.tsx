'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ContributeItem, ContributeType } from '@/lib/kv-contribute';

interface Session {
  authenticated: boolean;
  user?: { username: string; name: string; avatarUrl: string };
}

const inputClass =
  'w-full bg-white/[0.04] border border-white/[0.09] rounded-xl px-4 py-2.5 text-white placeholder-white/20 text-sm focus:outline-none focus:border-purple-500/40 focus:bg-white/[0.06] transition-all';

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function repoName(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '').replace(/\/$/, '') || url;
  } catch {
    return url;
  }
}

export function ContributeBoard({ initialItems }: { initialItems: ContributeItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [activeType, setActiveType] = useState<ContributeType>('issue');
  const [session, setSession] = useState<Session | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  async function refresh() {
    const res = await fetch('/api/contribute');
    if (res.ok) setItems(await res.json());
  }

  async function handleClaim(id: string) {
    setClaiming(id);
    setBanner(null);
    try {
      const res = await fetch('/api/contribute/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ kind: 'success', text: 'Claimed! It stays yours for 7 days.' });
        await refresh();
      } else {
        setBanner({ kind: 'error', text: data.error ?? 'Could not claim this issue.' });
      }
    } catch {
      setBanner({ kind: 'error', text: 'Network error.' });
    } finally {
      setClaiming(null);
    }
  }

  const filtered = items.filter((i) => i.type === activeType);
  const isLoggedIn = !!session?.authenticated;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex bg-white/[0.03] border border-white/[0.07] rounded-xl p-1">
          {(['issue', 'repo'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeType === t ? 'bg-white/[0.08] text-white border border-white/[0.12]' : 'text-white/40 hover:text-white/60'
              }`}
            >
              {t === 'issue' ? 'Issues' : 'Repositories'}
              <span className="ml-1.5 text-xs text-white/30">
                ({items.filter((i) => i.type === t).length})
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm font-semibold px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] hover:bg-white/[0.08] hover:border-white/[0.15] text-white/85 transition-all"
        >
          + Submit {activeType === 'issue' ? 'an Issue' : 'a Repository'}
        </button>
      </div>

      <p className="text-white/35 text-xs leading-relaxed">
        {activeType === 'issue'
          ? "Found a good issue you're not going to work on yourself? Add it here so someone else can. Only students already on the leaderboard can claim one — claims free up automatically after 7 days."
          : 'Active, well-maintained projects worth exploring, curated by students and the NST SDC team.'}
      </p>

      {banner && (
        <p
          className={`text-sm rounded-xl px-4 py-2.5 border ${
            banner.kind === 'error'
              ? 'text-red-400 bg-red-500/10 border-red-500/20'
              : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
          }`}
        >
          {banner.text}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="bg-white/[0.025] border border-white/[0.07] rounded-2xl p-5 space-y-3 hover:bg-white/[0.035] transition-all"
          >
            {item.screenshotUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.screenshotUrl}
                alt=""
                className="w-full h-32 object-cover rounded-lg border border-white/[0.06]"
              />
            )}

            <div>
              <a
                href={item.repoLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/90 text-sm font-semibold hover:text-purple-400 transition-colors break-all"
              >
                {repoName(item.repoLink)}
              </a>
              <p className="text-white/45 text-xs leading-relaxed mt-1.5">{item.description}</p>
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              {item.siteLink && (
                <a href={item.siteLink} target="_blank" rel="noopener noreferrer" className="text-blue-400/80 hover:text-blue-300 transition-colors">
                  Site ↗
                </a>
              )}
              {item.issueLink && (
                <a href={item.issueLink} target="_blank" rel="noopener noreferrer" className="text-blue-400/80 hover:text-blue-300 transition-colors">
                  Issue ↗
                </a>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
              <span className="text-white/25 text-[11px]">
                Added by {item.submittedBy === 'NST SDC Team' ? item.submittedBy : `@${item.submittedBy}`}
              </span>

              {item.type === 'issue' &&
                (item.claimedBy ? (
                  <span className="text-[11px] text-white/45">
                    Claimed by{' '}
                    <Link href={`/contributors/${item.claimedBy}`} className="text-purple-400 hover:text-purple-300 font-medium">
                      @{item.claimedBy}
                    </Link>
                    {item.claimExpiresAt && ` · ${daysLeft(item.claimExpiresAt)}d left`}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={claiming === item.id}
                    onClick={() => handleClaim(item.id)}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-400 hover:bg-purple-500/20 transition-all disabled:opacity-50"
                  >
                    {claiming === item.id ? '...' : isLoggedIn ? 'Claim' : 'Sign in to claim'}
                  </button>
                ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="sm:col-span-2 text-center py-12 bg-white/[0.01] border border-white/[0.04] rounded-2xl text-white/25 text-sm">
            No {activeType === 'issue' ? 'issues' : 'repositories'} yet — be the first to add one.
          </div>
        )}
      </div>

      {showForm && (
        <SubmitModal
          type={activeType}
          isLoggedIn={isLoggedIn}
          onClose={() => setShowForm(false)}
          onSubmitted={() => {
            setShowForm(false);
            setBanner({ kind: 'success', text: 'Submitted! It will appear once an admin approves it.' });
            refresh();
          }}
        />
      )}
    </section>
  );
}

function SubmitModal({
  type,
  isLoggedIn,
  onClose,
  onSubmitted,
}: {
  type: ContributeType;
  isLoggedIn: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [repoLink, setRepoLink] = useState('');
  const [description, setDescription] = useState('');
  const [siteLink, setSiteLink] = useState('');
  const [issueLink, setIssueLink] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, repoLink, description, siteLink, issueLink, screenshotUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        onSubmitted();
      } else {
        setError(data.error ?? 'Failed to submit.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0a0e1a] border border-white/[0.1] rounded-2xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Submit {type === 'issue' ? 'an Issue' : 'a Repository'}</h3>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80 text-xl leading-none">
            ×
          </button>
        </div>

        {!isLoggedIn ? (
          <div className="space-y-3">
            <p className="text-white/50 text-sm">You need to sign in with GitHub to submit.</p>
            <a
              href="/api/auth/github"
              className="block text-center bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-2.5 rounded-xl transition-all"
            >
              Sign in with GitHub
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="url"
              required
              placeholder="Repository link (required)"
              value={repoLink}
              onChange={(e) => setRepoLink(e.target.value)}
              className={inputClass}
            />
            {type === 'issue' && (
              <>
                <input
                  type="url"
                  placeholder="Issue link (optional)"
                  value={issueLink}
                  onChange={(e) => setIssueLink(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="url"
                  placeholder="Project site link (optional)"
                  value={siteLink}
                  onChange={(e) => setSiteLink(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="url"
                  placeholder="Screenshot URL (optional)"
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  className={inputClass}
                />
              </>
            )}
            <textarea
              required
              placeholder="Short description — why is this worth contributing to?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-all"
            >
              {loading ? 'Submitting…' : 'Submit for Review'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
