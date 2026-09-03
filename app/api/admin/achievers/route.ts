import { checkAdminAuth } from '@/lib/admin-auth';
import { getAchieversKV, addAchiever, updateAchiever, deleteAchiever } from '@/lib/kv-achievers';
import { getStudentProfile } from '@/lib/github';
import { getStudentsKV } from '@/lib/kv-students';
import { revalidatePath } from 'next/cache';

/** GET /api/admin/achievers — list all achievers */
export async function GET() {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const achievers = await getAchieversKV();
  return Response.json(achievers);
}

/** POST /api/admin/achievers — add a new achiever */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { github, name, headline, bookingUrl, programs } = body as {
    github?: string; name?: string; headline?: string; bookingUrl?: string;
    programs?: Array<{ name: string; year?: number; org?: string; url?: string }>;
  };
  if (!github?.trim()) return Response.json({ error: 'Missing github username' }, { status: 400 });
  if (!programs?.length) return Response.json({ error: 'At least one program is required' }, { status: 400 });

  const username = github.trim();

  // 1. The account has to actually exist. Same check the public join flow does
  //    (app/api/join-requests) — without it a typo silently becomes a Hall of
  //    Fame entry pointing at nobody.
  const profile = await getStudentProfile(username);
  if (!profile) {
    return Response.json(
      { error: `GitHub username @${username} not found. Make sure it is spelled correctly.` },
      { status: 404 }
    );
  }

  // 2. Achievers must already be tracked contributors. Enforcing it here (rather
  //    than quietly adding them to the roster) keeps one source of truth for who
  //    is tracked, and guarantees an achiever always has a leaderboard row for
  //    their label to appear on — previously an achiever outside the roster was
  //    simply invisible on /contributors, with nothing to explain why.
  const students = await getStudentsKV();
  const isTracked = students.some((s) => s.github.toLowerCase() === username.toLowerCase());
  if (!isTracked) {
    return Response.json(
      { error: `@${username} is not in the tracker yet. Add them under Students first, then add them here.` },
      { status: 409 }
    );
  }

  const result = await addAchiever({
    github: github.trim(),
    ...(name?.trim() ? { name: name.trim() } : {}),
    ...(headline?.trim() ? { headline: headline.trim() } : {}),
    ...(bookingUrl?.trim() ? { bookingUrl: bookingUrl.trim() } : {}),
    programs,
  });
  if (!result.ok) return Response.json({ error: result.message }, { status: 409 });
  revalidatePath('/achievers');
  revalidatePath('/');
  return Response.json({ ok: true, merged: result.merged === true });
}

/** PATCH /api/admin/achievers — update an achiever { github, ...updates } */
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { github, ...updates } = body as { github?: string; [k: string]: unknown };
  if (!github) return Response.json({ error: 'Missing github' }, { status: 400 });
  const result = await updateAchiever(github, updates as Parameters<typeof updateAchiever>[1]);
  if (!result.ok) return Response.json({ error: 'Achiever not found' }, { status: 404 });
  revalidatePath('/achievers');
  revalidatePath('/');
  return Response.json({ ok: true });
}

/** DELETE /api/admin/achievers?github=username — remove an achiever */
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const github = searchParams.get('github');
  if (!github) return Response.json({ error: 'Missing ?github= param' }, { status: 400 });
  const result = await deleteAchiever(github);
  if (!result.ok) return Response.json({ error: 'Achiever not found' }, { status: 404 });
  revalidatePath('/achievers');
  revalidatePath('/');
  return Response.json({ ok: true });
}
