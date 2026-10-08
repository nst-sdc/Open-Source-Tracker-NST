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

  // 1. Achievers must already be tracked contributors. Enforcing it here (rather
  //    than quietly adding them to the roster) keeps one source of truth for who
  //    is tracked, and guarantees an achiever always has a leaderboard row for
  //    their label to appear on — previously an achiever outside the roster was
  //    simply invisible on /contributors, with nothing to explain why.
  //    It runs before the GitHub lookup because it is a KV read: it catches the
  //    usual typo without spending a GitHub call on it.
  const students = await getStudentsKV();
  const isTracked = students.some((s) => s.github.toLowerCase() === username.toLowerCase());
  if (!isTracked) {
    return Response.json(
      { error: `@${username} is not in the tracker yet. Add them under Students first, then add them here.` },
      { status: 409 }
    );
  }

  // 2. The account should also still exist on GitHub — a renamed or deleted
  //    account left behind in the roster would become a Hall of Fame entry
  //    pointing at nobody. Only a definitive 404 blocks the add: getStudentProfile
  //    throws on rate limits (403/429) and on GitHub 5xx, and letting that
  //    propagate turned a transient API hiccup into a bare 500 — which is how
  //    adding a second program to an existing achiever came to look like it
  //    failed for no reason. Someone already in the roster plainly exists, so a
  //    failed verification is logged and the add proceeds.
  try {
    const profile = await getStudentProfile(username);
    if (!profile) {
      return Response.json(
        { error: `GitHub username @${username} not found. Make sure it is spelled correctly.` },
        { status: 404 }
      );
    }
  } catch (err) {
    console.warn(
      `Could not verify @${username} against GitHub: ${err instanceof Error ? err.message : 'unknown error'}. ` +
      'They are in the roster, so the add is proceeding.'
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
