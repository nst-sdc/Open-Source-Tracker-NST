import { cookies } from 'next/headers';

export interface SessionUser {
  username: string;
  name: string;
  avatarUrl: string;
}

/** Resolves the current GitHub-OAuth-logged-in user server-side, or null if
 * not logged in / the token is no longer valid. Mirrors the check done in
 * app/api/auth/session/route.ts, shared here so submit/claim routes don't
 * each re-implement the GitHub /user round trip. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('github_oauth_token')?.value;
  if (!token) return null;

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      username: data.login,
      name: data.name || data.login,
      avatarUrl: data.avatar_url,
    };
  } catch {
    return null;
  }
}
