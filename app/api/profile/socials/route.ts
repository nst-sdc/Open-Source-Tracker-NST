import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/session';
import { isSameOrigin } from '@/lib/same-origin';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { getStudentsKV, findStudent } from '@/lib/kv-students';
import { deleteSocials, getSocials, normalizeSocials, saveSocials } from '@/lib/socials';
import { verifyLinks } from '@/lib/socials-verify';

export const dynamic = 'force-dynamic';

/** GET /api/profile/socials?username=… — public, what the profile card shows. */
export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get('username')?.trim();
  if (!username) return NextResponse.json({ error: 'username is required' }, { status: 400 });
  return NextResponse.json({ socials: await getSocials(username) });
}

/**
 * Who may write: the signed-in GitHub account, for its own page only. The
 * username never comes from the body; it is whoever GitHub says is calling.
 */
async function owner(request: Request) {
  if (!isSameOrigin(request)) return { error: NextResponse.json({ error: 'Cross-origin request refused' }, { status: 403 }) };
  const session = await getViewer(request);
  if (session.status === 'unavailable') {
    return { error: NextResponse.json({ error: 'Could not verify your sign-in right now. Try again in a minute.' }, { status: 503 }) };
  }
  if (session.status !== 'authenticated') {
    return { error: NextResponse.json({ error: 'Sign in with GitHub to edit your contact links.' }, { status: 401 }) };
  }
  const limited = await checkRateLimit(`rl:socials:user:${session.viewer.id}`, 20, 3600);
  if (!limited.allowed) return { error: rateLimitedResponse(limited.retryAfter) };
  const student = findStudent(await getStudentsKV(), session.viewer.login);
  if (!student) {
    return { error: NextResponse.json({ error: 'Only students on the tracker have a profile page to edit.' }, { status: 403 }) };
  }
  return { login: student.github };
}

/** PUT /api/profile/socials — replace your own links. Body: { tagline?, links: {…} } */
export async function PUT(request: Request) {
  const who = await owner(request);
  if ('error' in who) return who.error;
  const body = await request.json().catch(() => null);
  const result = normalizeSocials(body);
  if (!result.ok) return NextResponse.json({ error: 'Some fields need a fix.', fields: result.errors }, { status: 400 });
  // Format is fine; now ask each platform whether the account exists. A link
  // only becomes visible once it passes (or when the platform offers no way
  // to check, see lib/socials-verify.ts).
  const checked = await verifyLinks(result.value.links);
  if (Object.keys(checked.errors).length) {
    return NextResponse.json({ error: 'Some accounts could not be confirmed.', fields: checked.errors }, { status: 400 });
  }
  const toSave = { ...result.value, verifiedAt: checked.verifiedAt };
  if (!(await saveSocials(who.login, toSave))) {
    return NextResponse.json({ error: 'Could not save right now. Try again shortly.' }, { status: 503 });
  }
  revalidatePath(`/contributors/${who.login}`);
  return NextResponse.json({ ok: true, socials: toSave });
}

/** DELETE /api/profile/socials — clear your own links. */
export async function DELETE(request: Request) {
  const who = await owner(request);
  if ('error' in who) return who.error;
  await deleteSocials(who.login);
  revalidatePath(`/contributors/${who.login}`);
  return NextResponse.json({ ok: true });
}
