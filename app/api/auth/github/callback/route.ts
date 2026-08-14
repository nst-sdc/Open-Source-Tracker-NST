import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPublicOrigin } from '@/lib/request-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'OAuth code parameter is missing.' }, { status: 400 });
  }

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
    const cookieStore = await cookies();
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
        }
      }
    } catch (poolError) {
      console.error('Failed to add token to token pool:', poolError);
    }

    // Redirect to home/dashboard page
    return NextResponse.redirect(new URL('/', getPublicOrigin(request)));
  } catch (error) {
    console.error('GitHub OAuth callback exchange error:', error);
    return NextResponse.json({ error: 'An error occurred during code exchange.' }, { status: 500 });
  }
}
