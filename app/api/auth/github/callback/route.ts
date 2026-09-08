import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPublicOrigin } from '@/lib/request-origin';
import { OAUTH_STATE_COOKIE, decodeOAuthState, nonceMatches } from '@/lib/oauth-state';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'OAuth code parameter is missing.' }, { status: 400 });
  }

  // CSRF: the state GitHub echoes back must match the one we minted and put
  // in an httpOnly cookie. Without this an attacker can drive a victim's
  // browser through this callback with their own `code`, planting the
  // attacker's token in the victim's cookie -- and, below, in the shared
  // refresh pool. Checked before the code is exchanged, so a forged callback
  // costs nothing.
  const cookieStore = await cookies();
  const presented = decodeOAuthState(searchParams.get('state'));
  const expected = decodeOAuthState(cookieStore.get(OAUTH_STATE_COOKIE)?.value);
  cookieStore.delete(OAUTH_STATE_COOKIE); // single use, match or not

  if (!presented || !expected || !nonceMatches(presented.nonce, expected.nonce)) {
    console.warn('[oauth] rejected a callback with a missing or mismatched state');
    return NextResponse.json(
      { error: 'This sign-in link is invalid or expired. Please start again from the site.' },
      { status: 400 },
    );
  }
  const returnTo = expected.next;

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is missing.');
    return NextResponse.json({ error: 'OAuth configuration is missing.' }, { status: 500 });
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.json({ error: 'Failed to retrieve access token from GitHub.' }, { status: 500 });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.json({ error: tokenData.error_description || 'Access token was not returned.' }, { status: 400 });
    }

    // Save token in cookie
    cookieStore.set('github_oauth_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Fetch the user's GitHub profile to get their username
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData && userData.login) {
          // Save to token pool in KV
          const { kvGet, kvSet } = await import('@/lib/kv');
          const poolKey = 'github_token_pool';
          const pool = (await kvGet<Record<string, string>>(poolKey)) || {};
          pool[userData.login] = accessToken;
          await kvSet(poolKey, pool);
          console.log(`Added token for user ${userData.login} to token pool.`);
          // Deliberately NO `github_username` cookie. It used to be written
          // here as a convenience handle, and became an impersonation
          // vector: anything that read it believed a client-supplied name.
          // Identity is resolved from the token by lib/session.ts, and
          // logout evicts the pool entry by token value instead.
        }
      }
    } catch (poolError) {
      console.error('Failed to add token to token pool:', poolError);
    }

    // Back to wherever the student started. Already sanitized to a
    // same-site path by lib/oauth-state.ts.
    return NextResponse.redirect(new URL(returnTo, getPublicOrigin(request)));
  } catch (error) {
    console.error('GitHub OAuth callback exchange error:', error);
    return NextResponse.json({ error: 'An error occurred during code exchange.' }, { status: 500 });
  }
}
