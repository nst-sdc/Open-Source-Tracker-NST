import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPublicOrigin } from '@/lib/request-origin';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  createOAuthState,
  encodeOAuthState,
} from '@/lib/oauth-state';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    console.error('GITHUB_CLIENT_ID is not configured in environment variables.');
    return NextResponse.json(
      { error: 'GitHub OAuth Client ID is not configured.' },
      { status: 500 }
    );
  }

  // Where to land after signing in. Sanitized to a same-site path, so this
  // can never be turned into an open redirect.
  const requestedNext = new URL(request.url).searchParams.get('next');
  const state = createOAuthState(requestedNext);
  const cookieStore = await cookies();

  // If Client ID is mock/ADMIN, bypass the OAuth flow and log in using local GITHUB_TOKEN (Local Dev ONLY)
  if (clientId === 'ADMIN' && process.env.GITHUB_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'GitHub OAuth application credentials are not configured on production. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' },
        { status: 500 }
      );
    }
    cookieStore.set('github_oauth_token', process.env.GITHUB_TOKEN, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
    // The dev shortcut honours `next` too, so the signed-in flow can be
    // tested locally exactly as a student experiences it.
    return NextResponse.redirect(new URL(state.next, getPublicOrigin(request)));
  }

  // The nonce is what makes a forced callback fail: without a matching
  // cookie, an attacker cannot make a victim's browser complete a sign-in
  // with the attacker's code (which would plant the attacker's token in the
  // victim's cookie, and then in the shared refresh pool).
  const encodedState = encodeOAuthState(state);
  cookieStore.set(OAUTH_STATE_COOKIE, encodedState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });

  const githubUrl =
    `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&scope=read:user&state=${encodeURIComponent(encodedState)}`;

  return NextResponse.redirect(githubUrl);
}
