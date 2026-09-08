import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getViewer, getViewerToken, invalidateViewerCache } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Reports who the caller is, according to GitHub — never according to a
 * cookie the caller controls. Backed by lib/session.ts, so this endpoint and
 * the assistant/agent routes can never disagree about identity.
 *
 * Three states, not two. Nav re-fetches this on every route change, so
 * folding a GitHub outage into `authenticated: false` would visibly sign out
 * every student on the site during any blip. `unknown: true` means "we could
 * not check" and the client keeps whatever it had.
 */
export async function GET(request: Request) {
  const result = await getViewer(request);

  if (result.status === 'authenticated') {
    return NextResponse.json({
      authenticated: true,
      user: {
        username: result.viewer.login,
        name: result.viewer.name,
        avatarUrl: result.viewer.avatarUrl,
      },
    });
  }

  if (result.status === 'unavailable') {
    return NextResponse.json({ authenticated: false, unknown: true });
  }

  if (result.status === 'invalid') {
    // Genuinely dead credentials: clear them so the student sees a working
    // sign-in button instead of a silently broken session. Only reachable on
    // a real 401 — lib/session.ts maps 403/5xx to `unavailable` above.
    const token = await getViewerToken();
    if (token) await invalidateViewerCache(token);
    const cookieStore = await cookies();
    cookieStore.delete('github_oauth_token');
  }

  return NextResponse.json({ authenticated: false });
}
