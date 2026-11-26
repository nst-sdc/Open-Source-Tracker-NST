import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/session';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';
import { findInterestRegistration, upsertInterestRegistration, validateInterestInput } from '@/lib/kv-interest';

export const dynamic = 'force-dynamic';

/**
 * The open-source interest form. Both verbs identify the student from the
 * GitHub session (lib/session.ts), never from the body.
 *
 * GET  → who is signed in and whether they have registered already, so the
 *        form can prefill and show "you're registered".
 * POST → create or update the signed-in account's registration.
 */
function sessionError(status: 'anonymous' | 'invalid' | 'unavailable') {
  if (status === 'unavailable') return NextResponse.json({ error: 'We could not reach GitHub to check your sign-in. Try again in a moment.' }, { status: 503 });
  return NextResponse.json({ error: status === 'anonymous' ? 'Sign in with GitHub to register.' : 'Your GitHub sign-in expired. Sign in again to continue.' }, { status: 401 });
}

export async function GET(request: Request) {
  const session = await getViewer(request);
  if (session.status !== 'authenticated') {
    if (session.status === 'anonymous') return NextResponse.json({ authenticated: false });
    return sessionError(session.status);
  }
  const { viewer } = session;
  const registration = await findInterestRegistration(viewer.id);
  return NextResponse.json({
    authenticated: true,
    viewer: { login: viewer.login, name: viewer.name, avatarUrl: viewer.avatarUrl },
    registration: registration ? { name: registration.name, email: registration.email, batch: registration.batch, campus: registration.campus, createdAt: registration.createdAt, updatedAt: registration.updatedAt } : null,
  });
}

export async function POST(request: Request) {
  const limited = await checkRateLimit(`rl:interest-submit:${getClientIp(request)}`, 5, 60);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter, 'Too many submissions. Please try again in a minute.');

  const session = await getViewer(request);
  if (session.status !== 'authenticated') return sessionError(session.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const checked = validateInterestInput(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const { viewer } = session;
  const result = await upsertInterestRegistration({ id: viewer.id, login: viewer.login, avatarUrl: viewer.avatarUrl }, checked.input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  const { registration, created } = result;
  return NextResponse.json({
    ok: true,
    created,
    registration: { name: registration.name, email: registration.email, batch: registration.batch, campus: registration.campus, createdAt: registration.createdAt, updatedAt: registration.updatedAt },
  }, { status: created ? 201 : 200 });
}
