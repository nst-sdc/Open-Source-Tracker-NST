import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { languageCandidates, readOrgLanguages, refreshOrgLanguages, REMEASURE_AFTER_MS } from '@/lib/org-languages';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Under the tunnel's ~100 s cut-off. */
const BUDGET_MS = 70_000;

/** GET: how many organisations have a language profile, and how many are due. */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [candidates, store] = await Promise.all([languageCandidates(), readOrgLanguages()]);
  const now = Date.now();
  let measured = 0;
  let missing = 0;
  let stale = 0;
  for (const c of candidates) {
    const r = store[c.login.toLowerCase()];
    if (!r) continue;
    if (r.missing) missing++;
    else measured++;
    if (now - new Date(r.measuredAt).getTime() > REMEASURE_AFTER_MS) stale++;
  }
  return NextResponse.json({ candidates: candidates.length, measured, missing, stale, due: candidates.length - measured - missing + stale });
}

/**
 * POST /api/admin/org-languages?limit=150
 *
 * Measures due organisations now, within a time budget, for the first fill
 * or after a long outage. The refresh tick does the same a few at a time.
 */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const limit = Math.min(400, Math.max(1, Number(url.searchParams.get('limit') ?? 150) || 150));
  const started = Date.now();
  const r = await refreshOrgLanguages(limit, { budgetMs: BUDGET_MS });
  return NextResponse.json({ ...r, done: r.remaining === 0 && !r.stoppedBy, elapsedMs: Date.now() - started });
}
