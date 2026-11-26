import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getForms, saveForm, deleteForm, getResponses } from '@/lib/kv-forms';
import { validateFormDef } from '@/lib/form-defs';

export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/forms            — every definition with its response count.
 * POST   /api/admin/forms            — create or update a definition (body: FormDef-ish).
 * DELETE /api/admin/forms?slug=x     — remove a custom form and its responses.
 */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const forms = await getForms();
  const counts = await Promise.all(forms.map(async (f) => (await getResponses(f.slug)).length));
  return NextResponse.json({ forms: forms.map((f, i) => ({ ...f, responses: counts[i] })) });
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const checked = validateFormDef(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (!(await saveForm(checked.def))) return NextResponse.json({ error: 'The store did not accept the form.' }, { status: 503 });
  return NextResponse.json({ ok: true, form: checked.def });
}

export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  const result = await deleteForm(slug);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
