import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getInterestRegistrations, interestCsv } from '@/lib/kv-interest';
import { getStudentsKV } from '@/lib/kv-students';
import { readInterestUsage } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/interest?days=30     — every registration, newest first, plus the
 *                                       form's funnel counts over the last `days`.
 * GET /api/admin/interest?format=csv  — the registrations as a CSV download.
 */
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const list = await getInterestRegistrations();
  if (new URL(request.url).searchParams.get('format') === 'csv') {
    const day = new Date().toISOString().slice(0, 10);
    return new Response(interestCsv(list), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="open-source-interest-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const days = Number(new URL(request.url).searchParams.get('days')) || 30;
  const [students, usage] = await Promise.all([getStudentsKV(), readInterestUsage(days)]);
  const roster = new Set(students.map((s) => s.github.toLowerCase()));
  const registrations = [...list]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ ...r, onRoster: roster.has(r.github.toLowerCase()) }));
  return NextResponse.json({ total: registrations.length, onRoster: registrations.filter((r) => r.onRoster).length, registrations, usage, usageDays: days });
}
