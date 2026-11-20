import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getGateRules, saveGateRules, DEFAULT_GATE_RULES, type GateRules } from '@/lib/gate-rules';
import { reclassifyRepos } from '@/lib/reclassify';

export const dynamic = 'force-dynamic';

/** GET /api/admin/gate-rules — current rules and the defaults. */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ rules: await getGateRules(), defaults: DEFAULT_GATE_RULES });
}

/** PUT /api/admin/gate-rules — save the rules, then re-gate every cached repository. */
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Partial<GateRules> | null;
  if (!body) return NextResponse.json({ error: 'Send the rules as JSON.' }, { status: 400 });
  const lists = ['nstOwners', 'nstOwnerKeywords', 'practiceRepos', 'practiceKeywords'] as const;
  for (const k of lists) if (body[k] !== undefined && !Array.isArray(body[k])) return NextResponse.json({ error: `${k} must be a list` }, { status: 400 });
  const current = await getGateRules();
  const next: GateRules = { ...current, ...body };
  if (!(await saveGateRules(next))) return NextResponse.json({ error: 'The store did not accept the rules.' }, { status: 503 });
  const reclassified = await reclassifyRepos();
  return NextResponse.json({ ok: true, rules: await getGateRules(), reclassified });
}

/** POST /api/admin/gate-rules — re-gate every cached repository with the current rules. */
export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, reclassified: await reclassifyRepos() });
}
