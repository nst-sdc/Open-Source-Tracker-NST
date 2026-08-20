import { checkAdminAuth, getAdminUsername } from '@/lib/admin-auth';
import { getDynamicAdminUsernamesKV, addAdminUsername, removeAdminUsername } from '@/lib/kv-admins';
import { getStudentProfile } from '@/lib/github';

function getSeedAdminUsernames(): string[] {
  return (process.env.SEED_ADMIN_USERNAMES ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

/** GET /api/admin/admins — list seed (env, read-only) and dynamic (KV, editable) admins */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dynamic = await getDynamicAdminUsernamesKV();
  return Response.json({ seed: getSeedAdminUsernames(), dynamic });
}

/** POST /api/admin/admins — grant admin access to a GitHub username */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { github } = body as { github?: string };
  if (!github?.trim()) {
    return Response.json({ error: 'GitHub username is required.' }, { status: 400 });
  }
  const username = github.trim();

  if (getSeedAdminUsernames().some((u) => u.toLowerCase() === username.toLowerCase())) {
    return Response.json({ error: `@${username} is already an admin (seed list).` }, { status: 400 });
  }

  // Catch typos before granting access to a username that doesn't exist.
  const profile = await getStudentProfile(username);
  if (!profile) {
    return Response.json({ error: `GitHub username @${username} not found.` }, { status: 400 });
  }

  const result = await addAdminUsername(profile.login);
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 400 });
  }
  return Response.json({ ok: true });
}

/** DELETE /api/admin/admins?github=username — revoke a dynamically-granted admin */
export async function DELETE(request: Request) {
  const actingAdmin = await getAdminUsername();
  if (!actingAdmin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const github = searchParams.get('github');
  if (!github) {
    return Response.json({ error: 'Missing ?github= param' }, { status: 400 });
  }

  if (github.toLowerCase() === actingAdmin.toLowerCase()) {
    return Response.json({ error: 'You cannot remove your own admin access.' }, { status: 400 });
  }
  if (getSeedAdminUsernames().some((u) => u.toLowerCase() === github.toLowerCase())) {
    return Response.json({ error: 'Seed admins are set via deployment config and cannot be removed here.' }, { status: 400 });
  }

  const result = await removeAdminUsername(github);
  if (!result.ok) {
    return Response.json({ error: 'Admin not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
