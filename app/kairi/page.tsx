import Link from 'next/link';
import { getViewer } from '@/lib/session';
import { KAIRI_LIMITS, KAIRI_NAME, KAIRI_PATH, KAIRI_TAGLINE } from '@/lib/kairi';
import { KairiConsole } from './KairiConsole';

export const metadata = {
  title: `${KAIRI_NAME} — Opensource Tracker NST`,
  description: KAIRI_TAGLINE,
};

/**
 * The agent's own section.
 *
 * Three states, not two. "Signed out" and "we could not check" are different
 * situations and telling a student their sign-in failed when GitHub was
 * merely unreachable sends them off to re-authenticate for nothing.
 *
 * Deliberately not `redirect('/login')`: /login still describes itself as an
 * optional upgrade, which is no longer true here, and bouncing a curious
 * first-time visitor off the page loses them. The sign-in prompt is shown in
 * place, with the explanation attached.
 *
 * No `export const dynamic` and no layout-level auth check: awaiting
 * cookies() via getViewer() already opts this route out of prerendering, and
 * a layout would not re-run on client navigation, so the session check could
 * go stale.
 */
export default async function KairiPage() {
  const session = await getViewer();

  if (session.status === 'authenticated') {
    return <KairiConsole viewer={session.viewer} />;
  }

  const unreachable = session.status === 'unavailable';

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-16">
      <div className="rounded-2xl border border-line bg-ground p-8">
        <h1 className="text-2xl font-[560] tracking-tight text-ink">{KAIRI_NAME}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{KAIRI_TAGLINE}</p>

        {unreachable ? (
          <div className="mt-7 rounded-xl border border-line bg-panel p-4">
            <p className="text-[14px] leading-relaxed text-ink">
              We couldn’t reach GitHub just now, so we can’t tell whether you’re signed in. This is
              almost always temporary — try again in a moment.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-7 rounded-xl border border-line bg-panel p-4">
              <p className="text-[14px] leading-relaxed text-ink">
                Sign in with GitHub to start. {KAIRI_NAME} needs to know who you are so it can answer
                questions about <em>your</em> pull requests, <em>your</em> standing and{' '}
                <em>your</em> flagged work — and so nobody can spend the shared AI budget anonymously.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                Read-only access to your public profile. Nothing is posted or changed on your behalf.
              </p>
              {/* A plain anchor, never <Link>: this target is a Route Handler
                  that sets cookies, and Link would prefetch it. */}
              <a
                href={`/api/auth/github?next=${encodeURIComponent(KAIRI_PATH)}`}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-[500] text-white transition-colors hover:bg-brand-600"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                  />
                </svg>
                Sign in with GitHub
              </a>
            </div>

            <div className="mt-6">
              <p className="text-[13px] font-[520] text-ink">What it can and can’t do</p>
              <ul className="mt-2 space-y-1">
                {KAIRI_LIMITS.map((line) => (
                  <li key={line} className="text-[13px] leading-relaxed text-ink-soft">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <p className="mt-7 border-t border-line pt-5 text-[13px] leading-relaxed text-ink-soft">
          You don’t need an account to browse. The{' '}
          <Link href="/contributors" className="text-brand-600 underline underline-offset-2">
            leaderboard
          </Link>
          ,{' '}
          <Link href="/issues" className="text-brand-600 underline underline-offset-2">
            common issues
          </Link>{' '}
          and the{' '}
          <Link href="/get-started" className="text-brand-600 underline underline-offset-2">
            getting-started guide
          </Link>{' '}
          are open to everyone.
        </p>
      </div>
    </main>
  );
}
