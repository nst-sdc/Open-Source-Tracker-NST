'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface GitHubProfile {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
}

export default function JoinRequestPage() {
  const [github, setGithub] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedProfile, setVerifiedProfile] = useState<GitHubProfile | null>(null);
  const [status, setStatus] = useState<'idle' | 'tracked' | 'pending' | 'eligible' | 'not_found' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [year, setYear] = useState<'1st year' | '2nd year' | '3rd year' | '4th year' | ''>('');
  const [campus, setCampus] = useState<'Rishihood' | 'ADYPU' | 'SVYASA' | ''>('');

  // Debounced profile verification and status check as the user types
  useEffect(() => {
    if (!github.trim()) {
      setStatus('idle');
      setStatusMessage('');
      setVerifiedProfile(null);
      setError('');
      return;
    }

    const timer = setTimeout(async () => {
      setVerifying(true);
      setError('');
      setStatusMessage('');
      try {
        const res = await fetch(`/api/join-requests?username=${encodeURIComponent(github.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          setStatusMessage(data.message || '');
          if (data.status === 'eligible' && data.profile) {
            setVerifiedProfile(data.profile);
          } else {
            setVerifiedProfile(null);
          }
        } else {
          setStatus('error');
          setError('Failed to check status.');
          setVerifiedProfile(null);
        }
      } catch {
        setStatus('error');
        setError('Network error checking status.');
        setVerifiedProfile(null);
      } finally {
        setVerifying(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [github]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!github.trim() || status !== 'eligible') return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/join-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          github: github.trim(),
          year: year || undefined,
          campus: campus || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Request submitted successfully! The admin queue will review @${github.trim()} soon.`);
        setGithub('');
        setYear('');
        setCampus('');
        setVerifiedProfile(null);
        setStatus('idle');
      } else {
        setError(data.error ?? 'Failed to submit request.');
      }
    } catch {
      setError('A network error occurred. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-panel flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-brand-100/40 blur-[130px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[250px] bg-violet-100/30 blur-[100px] rounded-full" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Navigation back */}
        <div className="flex justify-start mb-6">
          <Link
            href="/contributors"
            className="inline-flex items-center gap-2 text-ink-soft hover:text-ink-mid transition-colors text-sm font-[500]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
            </svg>
            Leaderboard
          </Link>
        </div>

        {/* Form Card */}
        <div className="bg-ground border border-line rounded-2xl p-8 shadow-card">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-11 h-11 rounded-xl bg-brand-0 border border-violet-100 flex items-center justify-center text-xl">
              📥
            </div>
            <div>
              <h1 className="text-xl font-[650] text-ink leading-tight">Join Leaderboard</h1>
              <p className="text-ink-soft text-xs mt-0.5">Check your status or submit a request to join</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2.5">
              <label htmlFor="github-input" className="block text-xs font-[550] text-ink-soft uppercase tracking-wider">
                GitHub Username / Search
              </label>
              <div className="relative">
                <input
                  id="github-input"
                  type="text"
                  required
                  placeholder="e.g. sarthak-gupta229"
                  value={github}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGithub(val);
                    if (!val.trim()) {
                      setVerifiedProfile(null);
                      setStatus('idle');
                      setError('');
                    }
                  }}
                  disabled={loading}
                  className="w-full bg-ground border border-line rounded-2xl pl-4 pr-12 py-3.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100 focus:bg-panel transition-all"
                />
                {verifying && (
                  <div className="absolute right-4 top-4">
                    <svg className="w-5 h-5 animate-spin text-violet-600/70" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Verification Preview */}
            {verifiedProfile && status === 'eligible' && (
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-violet-0 border border-violet-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <img
                  src={verifiedProfile.avatar_url}
                  alt={verifiedProfile.login}
                  className="w-12 h-12 rounded-full ring-2 ring-violet-100 flex-shrink-0 object-cover"
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-[550] text-ink truncate">
                    {verifiedProfile.name ?? verifiedProfile.login}
                  </h3>
                  <p className="text-violet-600 text-xs font-mono">@{verifiedProfile.login}</p>
                  {verifiedProfile.bio && (
                    <p className="text-ink-soft text-xs mt-1 leading-normal line-clamp-2">{verifiedProfile.bio}</p>
                  )}
                </div>
              </div>
            )}

            {/* Year & Campus Selects */}
            {status === 'eligible' && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-2">
                  <label htmlFor="year-select" className="block text-xs font-[550] text-ink-soft uppercase tracking-wider">
                    Year
                  </label>
                  <select
                    id="year-select"
                    value={year}
                    onChange={(e) => setYear(e.target.value as any)}
                    className="w-full bg-ground border border-line rounded-2xl px-4 py-3.5 text-ink text-sm focus:outline-none focus:border-violet-100 transition-all cursor-pointer appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(140,149,166,0.95)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 16px center',
                      backgroundSize: '16px',
                    }}
                  >
                    <option value="" className="bg-ground text-ink">Select Year</option>
                    <option value="1st year" className="bg-ground text-ink">1st Year</option>
                    <option value="2nd year" className="bg-ground text-ink">2nd Year</option>
                    <option value="3rd year" className="bg-ground text-ink">3rd Year</option>
                    <option value="4th year" className="bg-ground text-ink">4th Year</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="campus-select" className="block text-xs font-[550] text-ink-soft uppercase tracking-wider">
                    Campus
                  </label>
                  <select
                    id="campus-select"
                    value={campus}
                    onChange={(e) => setCampus(e.target.value as any)}
                    className="w-full bg-ground border border-line rounded-2xl px-4 py-3.5 text-ink text-sm focus:outline-none focus:border-violet-100 transition-all cursor-pointer appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(140,149,166,0.95)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 16px center',
                      backgroundSize: '16px',
                    }}
                  >
                    <option value="" className="bg-ground text-ink">Select Campus</option>
                    <option value="Rishihood" className="bg-ground text-ink">Rishihood</option>
                    <option value="ADYPU" className="bg-ground text-ink">ADYPU</option>
                    <option value="SVYASA" className="bg-ground text-ink">SVYASA</option>
                  </select>
                </div>
              </div>
            )}

            {/* Tracked Message */}
            {status === 'tracked' && (
              <div className="flex flex-col gap-3 bg-success-0 border border-success-100 rounded-2xl p-4 text-success-600 text-sm animate-in fade-in duration-200">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 flex-shrink-0 text-success-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.8-9.8a1 1 0 00-1.6-1.2L9 11.2l-1.2-1.2a1 1 0 00-1.6 1.4l2 2a1 1 0 001.6 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="leading-snug">{statusMessage}</p>
                </div>
                <div className="flex gap-2.5 mt-2 justify-end">
                  <Link
                    href={`/contributors/${github.trim()}`}
                    className="px-3.5 py-1.5 rounded-lg bg-success-500/20 hover:bg-success-500/30 text-success-600 text-xs font-[650] transition-all"
                  >
                    View My Profile
                  </Link>
                  <Link
                    href="/contributors"
                    className="px-3.5 py-1.5 rounded-lg bg-panel hover:bg-panel text-ink text-xs font-[650] transition-all"
                  >
                    Leaderboard
                  </Link>
                </div>
              </div>
            )}

            {/* Pending Message */}
            {status === 'pending' && (
              <div className="flex items-start gap-3 bg-brand-0 border border-brand-100 rounded-2xl p-4 text-brand-600 text-sm animate-in fade-in duration-200">
                <svg className="w-5 h-5 flex-shrink-0 text-brand-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z" clipRule="evenodd" />
                </svg>
                <p className="leading-snug">{statusMessage}</p>
              </div>
            )}

            {/* Not Found Message */}
            {status === 'not_found' && (
              <div className="flex items-start gap-3 bg-error-0 border border-error-100 rounded-2xl p-4 text-error-600 text-sm animate-in fade-in duration-200">
                <svg className="w-5 h-5 flex-shrink-0 text-error-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <p className="leading-snug">{statusMessage}</p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 bg-error-0 border border-error-100 rounded-2xl p-4 text-error-600 text-sm animate-in fade-in duration-200">
                <svg className="w-5 h-5 flex-shrink-0 text-error-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <p className="leading-snug">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="flex items-start gap-3 bg-success-0 border border-success-100 rounded-2xl p-4 text-success-600 text-sm animate-in fade-in duration-200">
                <svg className="w-5 h-5 flex-shrink-0 text-success-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.8-4.8a1 1 0 011.6 0l2 2a1 1 0 01-1.6 1.4L9 15.4l-1.2-1.2a1 1 0 011.6-1.4l2 2z" />
                </svg>
                <p className="leading-snug">{success}</p>
              </div>
            )}

            {status === 'eligible' && (
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-[550] py-3.5 rounded-2xl transition-all shadow-brand-btn hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting Request…
                  </>
                ) : (
                  'Submit Join Request'
                )}
              </button>
            )}
          </form>
        </div>

        {/* Help box */}
        <div className="mt-6 text-center text-xs text-ink-soft">
          Already registered? Check the{' '}
          <Link href="/contributors" className="text-violet-600 hover:text-violet-500 underline font-[500]">
            Leaderboard
          </Link>{' '}
          or search your ID directly on{' '}
          <Link href="/check-work" className="text-violet-600 hover:text-violet-500 underline font-[500]">
            Check My Work
          </Link>.
        </div>
      </div>
    </main>
  );
}
