import { cookies } from 'next/headers';

const COOKIE_NAME = 'admin_session';
const COOKIE_VALUE = 'authenticated';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password } = body as { password?: string };

  // Fail closed when ADMIN_PASSWORD is unset. This used to fall back to a
  // hardcoded 'admin123', so any deployment missing the variable — a pull
  // request preview, a fresh environment, a secret that silently failed to
  // mount — served a reachable admin panel behind a password anyone reading
  // this file already knew.
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.error('[admin] ADMIN_PASSWORD is not set — refusing all admin logins.');
    return Response.json(
      { error: 'Admin access is not configured on this deployment.' },
      { status: 503 }
    );
  }

  if (!password || password !== expected) {
    return Response.json({ error: 'Invalid password' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, COOKIE_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return Response.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return Response.json({ ok: true });
}
