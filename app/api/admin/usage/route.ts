import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { readUsage } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/** GET /api/admin/usage?days=30 — daily visitors, signed-in users, views, top pages. */
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const days = Number(new URL(request.url).searchParams.get('days')) || 30;
  const report = await readUsage(days);
  if (!report) return NextResponse.json({ error: 'The store did not answer.' }, { status: 503 });
  return NextResponse.json(report);
}
