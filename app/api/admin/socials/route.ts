import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/admin-auth';
import { deleteSocials, getSocials } from '@/lib/socials';

/** GET /api/admin/socials?github=… — inspect a student's contact links. */
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const github = new URL(request.url).searchParams.get('github')?.trim();
  if (!github) return NextResponse.json({ error: 'Missing ?github= param' }, { status: 400 });
  return NextResponse.json({ socials: await getSocials(github) });
}

/** DELETE /api/admin/socials?github=… — moderation: clear a student's contact links. */
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const github = new URL(request.url).searchParams.get('github')?.trim();
  if (!github) return NextResponse.json({ error: 'Missing ?github= param' }, { status: 400 });
  await deleteSocials(github);
  revalidatePath(`/contributors/${github}`);
  return NextResponse.json({ ok: true });
}
