import { claimContributeItem } from '@/lib/kv-contribute';
import { getSessionUser } from '@/lib/session';
import { getStudentsKV } from '@/lib/kv-students';

export const dynamic = 'force-dynamic';

/** POST /api/contribute/claim — claim an issue. Requires GitHub login AND
 * already being a tracked student — claiming is a tracker-member privilege,
 * submitting one is not. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: 'You must be signed in with GitHub to claim an issue.' }, { status: 401 });
  }

  const students = await getStudentsKV();
  const isTracked = students.some((s) => s.github.toLowerCase() === user.username.toLowerCase());
  if (!isTracked) {
    return Response.json(
      { error: 'Only students already on the leaderboard can claim issues. Join the tracker first.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 });
  }

  const result = await claimContributeItem(id, user.username);
  if (!result.ok) {
    return Response.json({ error: result.message ?? 'Could not claim this issue.' }, { status: 400 });
  }

  return Response.json({ ok: true });
}
