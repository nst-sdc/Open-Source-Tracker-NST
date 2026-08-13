import { checkAdminAuth } from '@/lib/admin-auth';
import { getOwnRepoExceptions, addOwnRepoException, removeOwnRepoException } from '@/lib/kv-own-repo-exceptions';

/** GET /api/admin/own-repos — list all own-repo exceptions */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return Response.json(await getOwnRepoExceptions());
}

/** POST /api/admin/own-repos — approve a student's own repo (body: { username, repo, note? }) */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { username, repo, note } = body as { username?: string; repo?: string; note?: string };

  if (!username || !repo) {
    return Response.json({ error: 'Missing required fields: username, repo' }, { status: 400 });
  }
  if (!repo.includes('/')) {
    return Response.json({ error: 'repo must be in "owner/repo" form' }, { status: 400 });
  }

  await addOwnRepoException({ username: username.trim(), repo: repo.trim(), note });
  return Response.json({ ok: true });
}

/** DELETE /api/admin/own-repos?username=X&repo=owner/repo — revoke an exception */
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const repo = searchParams.get('repo');
  if (!username || !repo) {
    return Response.json({ error: 'Missing ?username= and ?repo= params' }, { status: 400 });
  }

  const removed = await removeOwnRepoException(username, repo);
  return Response.json({ ok: removed });
}
