'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BATCHES, CAMPUSES, type Batch, type Campus } from '@/lib/interest-form';

/**
 * The open-source interest form. Identity comes from the GitHub sign-in;
 * the student types only name, email, batch and campus. A second visit
 * shows what they registered and lets them update it.
 */
interface Viewer { login: string; name: string; avatarUrl: string }
interface Registration { name: string; email: string; batch: Batch; campus: Campus; createdAt: string; updatedAt: string }

const FORM_PATH = '/interest';
const SIGN_IN = `/api/auth/github?next=${encodeURIComponent(FORM_PATH)}`;

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(140,149,166,0.95)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 16px center',
  backgroundSize: '16px',
} as const;
const fieldClass = 'w-full bg-ground border border-line rounded-2xl px-4 py-3.5 text-ink placeholder:text-ink-soft text-sm focus:outline-none focus:border-violet-100 focus:bg-panel transition-all';
const labelClass = 'block text-xs font-[550] text-ink-soft uppercase tracking-wider';

/** What a registered student is pointed at next. Dates stay general on purpose; the programme pages carry the exact ones. */
const PROGRAMMES = [
  { name: 'Google Summer of Code', note: 'Applications open in March · 12 weeks, May to August', href: '/programs#gsoc' },
  { name: 'LFX Mentorship', note: 'Linux Foundation · spring term applications in January', href: '/programs#lfx' },
  { name: 'Summer of Bitcoin', note: 'Bitcoin and Lightning projects · summer internship', href: '/organizations?program=sob' },
  { name: 'European Summer of Code', note: 'European open-source projects · summer', href: '/organizations?program=esoc' },
  { name: 'Outreachy', note: 'Two rounds a year · for people under-represented in tech', href: '/programs#outreachy' },
];

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function InterestForm() {
  const [phase, setPhase] = useState<'loading' | 'anonymous' | 'form' | 'done' | 'unavailable'>('loading');
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [existing, setExisting] = useState<Registration | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [batch, setBatch] = useState<Batch | ''>('');
  const [campus, setCampus] = useState<Campus | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/interest')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 503) { setPhase('unavailable'); return; }
        if (!res.ok || !data.authenticated) { setPhase('anonymous'); return; }
        setViewer(data.viewer);
        if (data.registration) {
          setExisting(data.registration);
          setName(data.registration.name);
          setEmail(data.registration.email);
          setBatch(data.registration.batch);
          setCampus(data.registration.campus);
          setPhase('done');
        } else {
          setName(data.viewer.name || '');
          setPhase('form');
        }
      })
      .catch(() => { if (!cancelled) setPhase('unavailable'); });
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, batch, campus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { setPhase('anonymous'); return; }
      if (!res.ok) { setError(data.error ?? 'Could not save your registration.'); return; }
      setExisting(data.registration);
      setPhase('done');
    } catch {
      setError('A network error occurred. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-panel flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-brand-100/40 blur-[130px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[250px] bg-violet-100/30 blur-[100px] rounded-full" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="bg-ground border border-line rounded-2xl p-8 shadow-card">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-11 h-11 rounded-xl bg-brand-0 border border-violet-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-4 3 4 3m8-6 4 3-4 3M14 4l-4 16" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-[650] text-ink leading-tight">Open Source Interest Form</h1>
              <p className="text-ink-soft text-xs mt-0.5">NST students · sign in with GitHub, fill four fields, done</p>
            </div>
          </div>

          {phase === 'loading' && <p className="text-ink-soft text-sm">Checking your sign-in…</p>}

          {phase === 'unavailable' && (
            <div className="bg-error-0 border border-error-100 rounded-2xl p-4 text-error-600 text-sm">
              We could not reach GitHub to check your sign-in. Refresh in a moment.
            </div>
          )}

          {phase === 'anonymous' && (
            <div className="space-y-5">
              <p className="text-ink-mid text-sm leading-relaxed">
                Interested in open source: contributing, GSoC, LFX, or just learning how it works? Register here so we can reach you with sessions, mentors and programme deadlines.
              </p>
              <ul className="text-ink-soft text-sm space-y-1.5">
                <li>· Your GitHub account identifies you, so there is nothing to type twice.</li>
                <li>· We ask for your name, college email, batch and campus.</li>
                <li>· You can come back and update it any time.</li>
              </ul>
              <a
                href={SIGN_IN}
                className="w-full bg-brand-solid hover:bg-brand-solid-hover text-white font-[550] py-3.5 rounded-2xl transition-all shadow-brand-btn hover:-translate-y-0.5 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
                </svg>
                Sign in with GitHub to register
              </a>
            </div>
          )}

          {(phase === 'form' || phase === 'done') && viewer && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-violet-0 border border-violet-100 mb-6">
              <img src={viewer.avatarUrl} alt="" className="w-10 h-10 rounded-full ring-2 ring-violet-100 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-[550] text-ink truncate">{viewer.name || viewer.login}</div>
                <div className="text-violet-600 text-xs font-mono">@{viewer.login}</div>
              </div>
              <a href="/api/auth/logout" className="text-xs text-ink-soft hover:text-ink-mid">Not you?</a>
            </div>
          )}

          {phase === 'done' && existing && viewer && (
            <div className="space-y-6">
              <div className="bg-success-0 border border-success-100 rounded-2xl p-4">
                <div className="flex items-start gap-3 text-success-600 text-sm">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.8-9.8a1 1 0 00-1.6-1.2L9 11.2l-1.2-1.2a1 1 0 00-1.6 1.4l2 2a1 1 0 001.6 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="leading-snug">
                    <p className="font-[650]">Thank you, {existing.name.split(' ')[0]}. You&apos;re on the list.</p>
                    <p className="mt-1">We&apos;ll write to <span className="font-[600]">{existing.email}</span> about sessions, mentors and deadlines.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-ink text-sm font-[650]">You&apos;re on the tracker now</h2>
                <p className="text-ink-mid text-sm leading-relaxed">
                  This site watches GitHub for every pull request and issue an NST student opens, checks what actually got merged, and ranks everyone across all four campuses. Nothing to report by hand: your account was just added to the roster, so your work starts counting from the next refresh.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Link href="/contributors" className="inline-flex items-center gap-1.5 bg-brand-solid hover:bg-brand-solid-hover text-white text-sm font-[550] px-4 py-2.5 rounded-xl transition-all shadow-brand-btn">
                    See the leaderboard →
                  </Link>
                  <Link href={`/contributors/${viewer.login}`} className="inline-flex items-center gap-1.5 border border-line hover:border-line-strong text-ink text-sm font-[550] px-4 py-2.5 rounded-xl transition-all">
                    Your profile
                  </Link>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-ink text-sm font-[650]">Want to spend your summer on one of these?</h2>
                <p className="text-ink-mid text-sm leading-relaxed">
                  Paid, remote, with a mentor from a real project. Students from NST have been selected for several of them. Applications close fast, and the ones who get in usually have merged PRs in the organisation months earlier, so this is the time to start.
                </p>
                <ul className="divide-y divide-line border border-line rounded-2xl overflow-hidden">
                  {PROGRAMMES.map((p) => (
                    <li key={p.name}>
                      <Link href={p.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-panel transition-colors">
                        <span className="min-w-0">
                          <span className="block text-ink text-sm font-[550]">{p.name}</span>
                          <span className="block text-ink-soft text-xs mt-0.5">{p.note}</span>
                        </span>
                        <span className="text-ink-faint text-sm shrink-0">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="text-ink-soft text-xs">
                  <Link href="/programs" className="text-violet-600 hover:text-violet-500 underline">All programmes</Link>
                  {' · '}
                  <Link href="/organizations" className="text-violet-600 hover:text-violet-500 underline">Organisations that take students</Link>
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-ink-soft text-xs">Registered {when(existing.createdAt)}{existing.updatedAt !== existing.createdAt ? ` · updated ${when(existing.updatedAt)}` : ''}</p>
                <button type="button" onClick={() => setPhase('form')} className="text-ink-soft hover:text-ink-mid text-xs font-[550] underline">
                  Update my details
                </button>
              </div>
            </div>
          )}

          {phase === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="interest-name" className={labelClass}>Full name</label>
                <input id="interest-name" type="text" required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="As on your college ID" />
              </div>
              <div className="space-y-2">
                <label htmlFor="interest-email" className={labelClass}>College email</label>
                <input id="interest-email" type="email" required maxLength={120} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="you@your-college-domain" />
                <p className="text-ink-soft text-xs">Your college address, so session invites and programme updates reach you.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="interest-batch" className={labelClass}>Batch</label>
                  <select id="interest-batch" required value={batch} onChange={(e) => setBatch(e.target.value as Batch)} className={`${fieldClass} cursor-pointer appearance-none`} style={selectStyle}>
                    <option value="" className="bg-ground text-ink">Select batch</option>
                    {BATCHES.map((b) => <option key={b} value={b} className="bg-ground text-ink">{b.replace(/^(\d)(st|nd|rd|th)/, '$1$2').replace(' year', ' Year')}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="interest-campus" className={labelClass}>Campus</label>
                  <select id="interest-campus" required value={campus} onChange={(e) => setCampus(e.target.value as Campus)} className={`${fieldClass} cursor-pointer appearance-none`} style={selectStyle}>
                    <option value="" className="bg-ground text-ink">Select campus</option>
                    {CAMPUSES.map((c) => <option key={c} value={c} className="bg-ground text-ink">{c}</option>)}
                  </select>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 bg-error-0 border border-error-100 rounded-2xl p-4 text-error-600 text-sm">
                  <p className="leading-snug">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !name.trim() || !email.trim() || !batch || !campus}
                className="w-full bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-[550] py-3.5 rounded-2xl transition-all shadow-brand-btn hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? 'Saving…' : existing ? 'Save changes' : 'Register'}
              </button>
              {existing && (
                <button type="button" onClick={() => { setPhase('done'); setError(''); }} className="w-full text-ink-soft hover:text-ink-mid text-sm py-1">Cancel</button>
              )}
            </form>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-ink-soft">
          Already contributing? See the{' '}
          <Link href="/contributors" className="text-violet-600 hover:text-violet-500 underline font-[500]">leaderboard</Link>
          {' '}or{' '}
          <Link href="/join" className="text-violet-600 hover:text-violet-500 underline font-[500]">join the tracker</Link>.
        </div>
      </div>
    </main>
  );
}
