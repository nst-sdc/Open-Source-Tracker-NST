import { checkAdminAuth } from '@/lib/admin-auth';
import { getStudentsKV, addStudent, removeStudent, updateStudentDetails, RosterUnavailableError } from '@/lib/kv-students';
import { revalidatePath } from 'next/cache';
import { invalidateSummaryCache } from '@/lib/summary-cache';

/** GET /api/admin/students — list all tracked students */
export async function GET() {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const students = await getStudentsKV();
  return Response.json(students);
}

/** POST /api/admin/students — add a student { github: "username", year, campus, name, email } */
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { github, year, campus, name, email } = body as {
    github?: string;
    year?: '1st year' | '2nd year' | '3rd year' | '4th year';
    campus?: 'Rishihood' | 'ADYPU' | 'SVYASA' | 'SMRU';
    name?: string;
    email?: string;
  };
  if (!github?.trim()) return Response.json({ error: 'Missing github username' }, { status: 400 });
  let result: { ok: boolean; message?: string };
  try {
    result = await addStudent(github.trim(), year, campus, { name, email });
  } catch (err) {
    if (err instanceof RosterUnavailableError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
  if (!result.ok) return Response.json({ error: result.message }, { status: 409 });
  
  // Invalidate summary cache so the leaderboard fetches the new student's data
  await invalidateSummaryCache();
  
  revalidatePath('/contributors');
  revalidatePath('/');
  return Response.json({ ok: true });
}

/** PUT /api/admin/students — edit a student's year/campus (and name/email when given) */
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { github, year, campus, name, email } = body as {
    github?: string;
    year?: '1st year' | '2nd year' | '3rd year' | '4th year';
    campus?: 'Rishihood' | 'ADYPU' | 'SVYASA' | 'SMRU';
    name?: string;
    email?: string;
  };
  if (!github?.trim()) return Response.json({ error: 'Missing github username' }, { status: 400 });
  let result: { ok: boolean; message?: string };
  try {
    result = await updateStudentDetails(github.trim(), year, campus, { name, email });
  } catch (err) {
    if (err instanceof RosterUnavailableError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
  if (!result.ok) return Response.json({ error: result.message || 'Student not found' }, { status: 404 });
  
  // Invalidate summary cache so the leaderboard updates
  await invalidateSummaryCache();
  
  revalidatePath('/contributors');
  revalidatePath('/');
  return Response.json({ ok: true });
}

/** DELETE /api/admin/students?github=username — remove a student */
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const github = searchParams.get('github');
  if (!github) return Response.json({ error: 'Missing ?github= param' }, { status: 400 });
  let result: { ok: boolean };
  try {
    result = await removeStudent(github);
  } catch (err) {
    if (err instanceof RosterUnavailableError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
  if (!result.ok) return Response.json({ error: 'Student not found' }, { status: 404 });
  
  // Invalidate summary cache so the leaderboard removes the student's data
  await invalidateSummaryCache();
  
  revalidatePath('/contributors');
  revalidatePath('/');
  return Response.json({ ok: true });
}
