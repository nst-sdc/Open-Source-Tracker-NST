import { cookies } from 'next/headers';
import {
  ADMIN_COOKIE_NAME,
  checkAdminAuth,
  createAdminSession,
  revokeAdminSession,
} from '@/lib/admin-auth';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Shared password, so brute force is the threat: 5 attempts/min per IP.
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_SECONDS = 60;

export async function POST(request: Request) {
  const limited = await checkRateLimit(
    `rl:admin-login:${getClientIp(request)}`,
    LOGIN_LIMIT,
    LOGIN_WINDOW_SECONDS
  );
  if (!limited.allowed) {
    return rateLimitedResponse(limited.retryAfter, 'Too many login attempts. Try again shortly.');
  }

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

  const session = await createAdminSession();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
  });

  return Response.json({ ok: true });
}

export async function DELETE() {
  // Revoke server-side so a stolen/copied cookie dies with logout.
  if (await checkAdminAuth()) {
    await revokeAdminSession();
  }
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return Response.json({ ok: true });
}
