import { checkAdminAuth } from '@/lib/admin-auth';
import { importStudents, RosterUnavailableError, type ImportRow } from '@/lib/kv-students';
import { invalidateSummaryCache } from '@/lib/summary-cache';
import { revalidatePath } from 'next/cache';

const YEARS = new Set(['1st year', '2nd year', '3rd year', '4th year']);
const CAMPUSES = new Set(['Rishihood', 'ADYPU', 'SVYASA', 'SMRU']);

/**
 * POST /api/admin/students/import — { rows: [{ github, name?, email?, year?, campus? }], year?, campus? }
 * Folds a list (a campus's year list, for instance) into the roster in one
 * write: unknown logins are added, known ones get the name, email, year and
 * campus the row (or the request's defaults) carries. Never removes anyone.
 */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { rows?: unknown; year?: unknown; campus?: unknown };
  if (!Array.isArray(body.rows) || body.rows.length === 0) return Response.json({ error: 'rows is required.' }, { status: 400 });
  if (body.rows.length > 2000) return Response.json({ error: 'At most 2,000 rows per import.' }, { status: 400 });
  const year = YEARS.has(String(body.year)) ? (body.year as ImportRow['year']) : undefined;
  const campus = CAMPUSES.has(String(body.campus)) ? (body.campus as ImportRow['campus']) : undefined;
  const rows: ImportRow[] = body.rows.map((r) => {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    return {
      github: String(x.github ?? ''),
      name: typeof x.name === 'string' ? x.name : undefined,
      email: typeof x.email === 'string' ? x.email : undefined,
      year: YEARS.has(String(x.year)) ? (x.year as ImportRow['year']) : year,
      campus: CAMPUSES.has(String(x.campus)) ? (x.campus as ImportRow['campus']) : campus,
    };
  });
  try {
    const result = await importStudents(rows);
    if (result.added.length) {
      await invalidateSummaryCache();
      revalidatePath('/contributors');
      revalidatePath('/');
    }
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RosterUnavailableError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
}
