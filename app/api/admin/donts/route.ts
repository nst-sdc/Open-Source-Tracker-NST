import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { anonymizeQuote } from '@/lib/closed-pr-review';
import { getClosedPrFeedback, getDonts, addDont, removeDont } from '@/lib/kv-closed-prs';

export const dynamic = 'force-dynamic';

/**
 * The public Don'ts: maintainers' words with the names removed, chosen by an admin.
 * GET    /api/admin/donts                 — the list.
 * POST   /api/admin/donts {key, index, lesson} — promote quote `index` of stored PR `key`, anonymised.
 * DELETE /api/admin/donts?id=…
 */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ donts: await getDonts() });
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { key?: string; index?: number; lesson?: string; quote?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const lesson = (body.lesson ?? '').toString().trim().slice(0, 160);
  if (!lesson) return NextResponse.json({ error: 'Say which rule the quote illustrates.' }, { status: 400 });
  const rows = await getClosedPrFeedback();
  const row = rows.find((r) => r.key === body.key);
  if (!row) return NextResponse.json({ error: 'No such scanned PR.' }, { status: 404 });
  const q = row.quotes[Number(body.index) || 0];
  if (!q) return NextResponse.json({ error: 'No such quote on that PR.' }, { status: 404 });
  const quote = anonymizeQuote(typeof body.quote === 'string' && body.quote.trim() ? body.quote : q.body, [row.login, q.login]).slice(0, 700);
  const when = q.createdAt ? new Date(q.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : undefined;
  const dont = await addDont({ quote, repo: row.repo, when, lesson });
  return NextResponse.json({ ok: true, dont });
}

export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const removed = await removeDont(id);
  return NextResponse.json({ ok: true, removed });
}
