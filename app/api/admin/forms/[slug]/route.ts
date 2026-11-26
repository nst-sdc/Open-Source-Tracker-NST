import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getForm, getResponses, removeResponse } from '@/lib/kv-forms';
import { responsesCsv } from '@/lib/form-defs';
import { getStudentsKV } from '@/lib/kv-students';
import { readFormUsage } from '@/lib/usage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * GET    /api/admin/forms/<slug>?days=30      — responses, newest first, with roster status and the funnel.
 * GET    /api/admin/forms/<slug>?format=csv   — responses as a CSV download.
 * DELETE /api/admin/forms/<slug>?githubId=N   — drop one response (the roster is untouched).
 */
export async function GET(request: Request, { params }: Params) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;
  const def = await getForm(slug);
  if (!def) return NextResponse.json({ error: 'No such form.' }, { status: 404 });
  const list = await getResponses(slug);
  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'csv') {
    const day = new Date().toISOString().slice(0, 10);
    return new Response(responsesCsv(def, list), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const days = Number(url.searchParams.get('days')) || 30;
  const [students, usage] = await Promise.all([def.addToRoster ? getStudentsKV() : Promise.resolve([]), readFormUsage(slug, days)]);
  const roster = new Set(students.map((s) => s.github.toLowerCase()));
  const responses = [...list]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ ...r, onRoster: def.addToRoster ? roster.has(r.github.toLowerCase()) : undefined }));
  return NextResponse.json({ form: def, total: responses.length, responses, usage, usageDays: days });
}

export async function DELETE(request: Request, { params }: Params) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;
  const githubId = Number(new URL(request.url).searchParams.get('githubId'));
  if (!Number.isInteger(githubId) || githubId <= 0) return NextResponse.json({ error: 'githubId is required.' }, { status: 400 });
  const result = await removeResponse(slug, githubId);
  if (!result.ok) return NextResponse.json({ error: 'The store did not accept the change.' }, { status: 503 });
  return NextResponse.json({ ok: true, removed: result.removed });
}
