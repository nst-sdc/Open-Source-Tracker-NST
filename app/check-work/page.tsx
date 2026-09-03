'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CheckWorkLandingPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user?.username) {
          router.replace(`/check-work/${encodeURIComponent(data.user.username)}`);
        } else {
          setAuthenticated(false);
        }
      })
      .catch(() => setAuthenticated(false));
  }, [router]);

  return (
    <main className="min-h-screen bg-panel flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Navigation back */}
        <div className="flex justify-start mb-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-ink-soft hover:text-ink transition-colors text-[13.5px] font-[500]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
        </div>

        {/* Card */}
        <div className="bg-ground border border-line rounded-2xl shadow-card p-7">
          <div className="flex items-center gap-3.5 mb-7">
            <div className="w-11 h-11 rounded-xl bg-brand-0 text-brand-600 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-[650] text-ink leading-tight">Check my work</h1>
              <p className="text-ink-soft text-xs mt-0.5">Verify your open-source contributions</p>
            </div>
          </div>

          {authenticated === null ? (
            /* Loading state */
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <svg className="w-8 h-8 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-ink-soft text-xs">Checking your session…</p>
            </div>
          ) : (
            /* Auth wall / Sign-in state */
            <div className="space-y-6">
              <div className="space-y-3.5">
                <h2 className="text-ink font-[650] text-sm">What you get:</h2>
                <ul className="space-y-3 text-[12.5px] text-ink-soft leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-success-600 shrink-0 mt-px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>Secure verification directly linked to your GitHub profile.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-success-600 shrink-0 mt-px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>Higher Search API rate limits for reliable contribution previews.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-success-600 shrink-0 mt-px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>Real-time checking for PR merges, open statuses, and comments.</span>
                  </li>
                </ul>
              </div>

              <a
                href="/api/auth/github"
                className="w-full bg-brand-solid hover:bg-brand-solid-hover text-white font-[550] h-12 rounded-[11px] transition-colors shadow-brand-btn flex items-center justify-center gap-2.5 cursor-pointer text-sm"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.193 22 16.44 22 12.017 22 6.484 17.522 2 12 2z" />
                </svg>
                Sign in with GitHub
              </a>
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="mt-5 text-center text-xs text-ink-soft px-4 leading-relaxed">
          This preview runs directly against live GitHub activity. To permanently showcase your work
          on the leaderboard, send a request from the{' '}
          <Link href="/join" className="text-brand-600 hover:text-brand-500 underline underline-offset-2 font-[550]">
            Join Tracker
          </Link>{' '}
          page.
        </div>
      </div>
    </main>
  );
}
