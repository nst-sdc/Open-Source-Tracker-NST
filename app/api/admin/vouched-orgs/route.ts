import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getVouchedOrgs, addVouchedOrg, removeVouchedOrg } from '@/lib/kv-vouched-orgs';
import { revalidateOwnerRepos } from '@/lib/revalidate-owner';

export const dynamic = 'force-dynamic';

/** GET /api/admin/vouched-orgs — the list. */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getVouchedOrgs());
}

/** POST /api/admin/vouched-orgs { login, note? } — vouch, then re-gate that org's cached repos. */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { login?: string; note?: string };
  if (!body.login?.trim()) return NextResponse.json({ error: 'login is required' }, { status: 400 });
  const result = await addVouchedOrg(body.login, body.note);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  const revalidated = await revalidateOwnerRepos(body.login.trim().replace(/^@/, ''));
  return NextResponse.json({ ok: true, revalidated });
}

/** DELETE /api/admin/vouched-orgs?login=… — un-vouch and re-gate. */
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const login = new URL(request.url).searchParams.get('login')?.trim();
  if (!login) return NextResponse.json({ error: 'Missing ?login= param' }, { status: 400 });
  const result = await removeVouchedOrg(login);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 404 });
  const revalidated = await revalidateOwnerRepos(login);
  return NextResponse.json({ ok: true, revalidated });
}
