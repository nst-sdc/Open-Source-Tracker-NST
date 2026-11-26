import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/session';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';
import { getForm, findResponse, upsertResponse, ensureOnRoster, markRosterAdded } from '@/lib/kv-forms';
import { validateAnswers } from '@/lib/form-defs';
import { invalidateSummaryCache } from '@/lib/summary-cache';
import { recordFormEvent } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/**
 * A public form. Both verbs identify the student from the GitHub session
 * (lib/session.ts), never from the body.
 *
 * GET  → the definition, who is signed in, and their existing response.
 * POST → create or update the signed-in account's response.
 */
type Params = { params: Promise<{ slug: string }> };

function sessionError(status: 'anonymous' | 'invalid' | 'unavailable') {
  if (status === 'unavailable') return NextResponse.json({ error: 'We could not reach GitHub to check your sign-in. Try again in a moment.' }, { status: 503 });
  return NextResponse.json({ error: status === 'anonymous' ? 'Sign in with GitHub to continue.' : 'Your GitHub sign-in expired. Sign in again to continue.' }, { status: 401 });
}

const publicDef = (d: NonNullable<Awaited<ReturnType<typeof getForm>>>) => ({
  slug: d.slug, title: d.title, subtitle: d.subtitle, intro: d.intro, bullets: d.bullets, thanks: d.thanks, thanksNote: d.thanksNote, fields: d.fields, open: d.open,
});

export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const def = await getForm(slug);
  if (!def) return NextResponse.json({ error: 'No such form.' }, { status: 404 });
  const session = await getViewer(request);
  if (session.status !== 'authenticated') {
    if (session.status === 'anonymous') return NextResponse.json({ form: publicDef(def), authenticated: false });
    return sessionError(session.status);
  }
  const { viewer } = session;
  const existing = await findResponse(slug, viewer.id);
  return NextResponse.json({
    form: publicDef(def),
    authenticated: true,
    viewer: { login: viewer.login, name: viewer.name, avatarUrl: viewer.avatarUrl },
    response: existing ? { answers: existing.answers, createdAt: existing.createdAt, updatedAt: existing.updatedAt } : null,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  // A whole campus sits behind one NAT address, so the per-IP ceiling is
  // wide and only stops floods; the real limit is per signed-in account.
  const perIp = await checkRateLimit(`rl:form-submit:${getClientIp(request)}`, 300, 60);
  if (!perIp.allowed) return rateLimitedResponse(perIp.retryAfter, 'Too many submissions from your network. Please try again in a minute.');

  const def = await getForm(slug);
  if (!def) return NextResponse.json({ error: 'No such form.' }, { status: 404 });
  if (!def.open) return NextResponse.json({ error: 'This form is closed.' }, { status: 403 });

  const session = await getViewer(request);
  if (session.status !== 'authenticated') return sessionError(session.status);
  const perUser = await checkRateLimit(`rl:form-submit:user:${session.viewer.id}`, 10, 60);
  if (!perUser.allowed) return rateLimitedResponse(perUser.retryAfter, 'Too many submissions. Please try again in a minute.');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const checked = validateAnswers(def, body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const { viewer } = session;
  const result = await upsertResponse(slug, { id: viewer.id, login: viewer.login, avatarUrl: viewer.avatarUrl }, checked.answers);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  const { response, created } = result;
  void recordFormEvent(slug, created ? 'registered' : 'updated').catch(() => {});

  // 'deferred': the roster lock stayed busy; the refresh tick's reconcile adds them within the hour.
  let roster: 'added' | 'already' | 'updated' | 'unavailable' | 'deferred' | 'off' = 'off';
  if (def.addToRoster) {
    roster = await ensureOnRoster(viewer.login, checked.answers);
    if (roster === 'added') {
      await markRosterAdded(slug, viewer.id);
      await invalidateSummaryCache();
      revalidatePath('/contributors');
      revalidatePath('/');
    }
  }
  return NextResponse.json(
    { ok: true, created, roster, response: { answers: response.answers, createdAt: response.createdAt, updatedAt: response.updatedAt } },
    { status: created ? 201 : 200 },
  );
}
