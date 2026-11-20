import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getPrValueSetting, setPrValueSetting } from '@/lib/kv-pr-value';
import { invalidateSummaryCache } from '@/lib/summary-cache';
import { PR_VALUE_RULES, PR_VALUE_MIN, PR_VALUE_MAX } from '@/lib/pr-value';

export const dynamic = 'force-dynamic';

/** GET /api/admin/pr-value — whether merged PRs are weighted by their own contribution value, and the rules. */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ setting: await getPrValueSetting(), rules: PR_VALUE_RULES, min: PR_VALUE_MIN, max: PR_VALUE_MAX });
}

/** PUT /api/admin/pr-value {enabled} — flip the switch; the leaderboard caches are invalidated so the next refresh rebuilds every period with the new scoring. */
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Send {"enabled": true|false}.' }, { status: 400 });
  if (!(await setPrValueSetting(body.enabled))) return NextResponse.json({ error: 'The store did not accept the change.' }, { status: 503 });
  await invalidateSummaryCache();
  return NextResponse.json({ setting: await getPrValueSetting() });
}
