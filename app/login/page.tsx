'use client';

import Link from 'next/link';

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-panel flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        {/* Title */}
        <div className="mb-7">
          <div className="inline-flex items-center gap-1.5 bg-brand-0 rounded-full px-3.5 py-1.5 text-xs font-[650] text-brand-600 mb-4">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m13 2-2 9h5l-4 11 1-8H8l5-12z" />
            </svg>
            Optional upgrade
          </div>
          <h1 className="text-[26px] font-[650] tracking-[-0.01em] text-ink">
            Opensource Tracker <span className="text-brand-500">NST</span>
          </h1>
          <p className="text-ink-soft text-sm mt-2.5 leading-relaxed">
            The leaderboard and profiles are public — no login needed. Sign in with GitHub to get
            unlimited refreshes on your own profile, and to help everyone else too: your token adds
            to the shared pool that powers guest requests.
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-ground border border-line rounded-2xl shadow-card p-8">
          <div className="w-13 h-13 p-3.5 mx-auto rounded-2xl bg-brand-0 text-brand-600 flex items-center justify-center mb-5">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
              <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
            </svg>
          </div>

          <h2 className="text-lg font-[650] text-ink mb-2">Sign in for unlimited refreshes</h2>
          <p className="text-ink-soft text-[12.5px] mb-7 leading-relaxed">
            We use your GitHub token only to raise your personal API rate limit and contribute to
            the shared pool — never to act on your behalf.
          </p>

          <Link
            href="/api/auth/github"
            prefetch={false}
            className="w-full flex items-center justify-center gap-2.5 bg-brand-solid hover:bg-brand-solid-hover text-white font-[550] h-12 rounded-[11px] transition-colors shadow-brand-btn cursor-pointer"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            Sign in with GitHub
          </Link>
        </div>

        {/* Footer info */}
        <div className="mt-6 text-xs text-ink-soft px-4 leading-relaxed">
          Secured via GitHub OAuth. We only request read-only access to your public profile.
        </div>
      </div>
    </main>
  );
}
