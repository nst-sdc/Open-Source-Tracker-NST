/**
 * lib/kv-students.ts
 *
 * KV-backed student list. Falls back to seeding from data/students.json on first load.
 * Replaces direct file reads in lib/github.ts for admin-managed student lists.
 *
 * The roster is append-only from the app's point of view: once an admin adds
 * a student, only an admin removes them. The refresh loop used to drop anyone
 * whose username 404ed on GitHub, which is what every rename and deleted
 * account looks like, and the tracker quietly lost ~170 students that way.
 * It now records what it learned instead (applyRosterUpdates): the numeric
 * GitHub id, a rename, or that the account can no longer be found.
 */

import { kvGet, kvSet } from './kv';
import { readFileSync } from 'fs';
import { join } from 'path';

const KV_KEY = 'students_list';

export interface Student {
  github: string;
  year?: '1st year' | '2nd year' | '3rd year' | '4th year';
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA';
  /** GitHub's numeric user id. Stable across renames, so it is how a 404ed
   *  login is resolved to its new name. Learned on the first successful fetch. */
  githubId?: number;
  /** Set when neither the login nor the id resolves on GitHub any more
   *  (deleted or suspended account). The student stays on the roster and in
   *  every count; an admin decides whether to remove them. Cleared if the
   *  account comes back. */
  unresolvedSince?: string;
  /** Earlier logins this student was tracked under, oldest first. */
  previousLogins?: string[];
}

/** What the refresh loop learned about a student in one tick. */
export type RosterUpdate =
  | { type: 'id'; github: string; githubId: number }
  | { type: 'rename'; github: string; newLogin: string; githubId: number }
  | { type: 'unresolved'; github: string }
  | { type: 'resolved'; github: string };

/**
 * Pure: applies updates to a roster and reports whether anything changed.
 * Never shrinks the roster except when a rename lands on a login that is
 * already tracked, which is the same person listed twice; the duplicate is
 * folded into the surviving entry.
 */
export function applyUpdates(list: Student[], updates: RosterUpdate[]): { list: Student[]; changed: boolean } {
  const out = list.map((s) => ({ ...s }));
  let changed = false;
  const find = (login: string) => out.findIndex((s) => s.github.toLowerCase() === login.toLowerCase());
  for (const u of updates) {
    const i = find(u.github);
    if (i === -1) continue;
    const s = out[i];
    switch (u.type) {
      case 'id':
        if (s.githubId !== u.githubId) { s.githubId = u.githubId; changed = true; }
        if (s.unresolvedSince) { delete s.unresolvedSince; changed = true; }
        break;
      case 'rename': {
        if (s.github.toLowerCase() === u.newLogin.toLowerCase()) {
          if (s.github !== u.newLogin) { s.github = u.newLogin; changed = true; }
          break;
        }
        const previous = [...(s.previousLogins ?? []), s.github];
        const j = find(u.newLogin);
        if (j !== -1) {
          // Same person tracked twice: keep the entry under the new login,
          // carry over anything only the old one knew.
          const keep = out[j];
          keep.year ??= s.year;
          keep.campus ??= s.campus;
          keep.githubId ??= u.githubId;
          keep.previousLogins = [...new Set([...(keep.previousLogins ?? []), ...previous])];
          delete keep.unresolvedSince;
          out.splice(i, 1);
        } else {
          s.github = u.newLogin;
          s.githubId = u.githubId;
          s.previousLogins = previous;
          delete s.unresolvedSince;
        }
        changed = true;
        break;
      }
      case 'unresolved':
        if (!s.unresolvedSince) { s.unresolvedSince = new Date().toISOString(); changed = true; }
        break;
      case 'resolved':
        if (s.unresolvedSince) { delete s.unresolvedSince; changed = true; }
        break;
    }
  }
  return { list: out, changed };
}

/** One read-modify-write for a whole tick's worth of updates. */
export async function applyRosterUpdates(updates: RosterUpdate[]): Promise<boolean> {
  if (updates.length === 0) return false;
  const current = await getStudentsKV();
  const { list, changed } = applyUpdates(current, updates);
  if (changed) await kvSet(KV_KEY, list);
  return changed;
}

/** Finds a student by current or any previous login. */
export function findStudent(list: Student[], login: string): Student | undefined {
  const lower = login.toLowerCase();
  return list.find(
    (s) => s.github.toLowerCase() === lower || (s.previousLogins ?? []).some((p) => p.toLowerCase() === lower),
  );
}

async function seedFromFile(): Promise<Student[]> {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'students.json'), 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const list: Student[] = data
      .map((s: unknown) => {
        if (typeof s === 'string') return { github: s };
        if (typeof s === 'object' && s !== null && typeof (s as Record<string, unknown>).github === 'string') {
          const row = s as Partial<Student> & { github: string };
          return { github: row.github, year: row.year, campus: row.campus };
        }
        return null;
      })
      .filter((s): s is Student => s !== null);
    await kvSet(KV_KEY, list);
    return list;
  } catch {
    return [];
  }
}

export async function getStudentsKV(): Promise<Student[]> {
  const cached = await kvGet<Student[]>(KV_KEY);
  if (cached !== null) return cached;
  return seedFromFile();
}

export async function addStudent(
  github: string,
  year?: '1st year' | '2nd year' | '3rd year' | '4th year',
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA'
): Promise<{ ok: boolean; message?: string }> {
  const list = await getStudentsKV();
  const lower = github.toLowerCase().trim();
  if (!lower) return { ok: false, message: 'GitHub username cannot be empty' };
  if (list.some((s) => s.github.toLowerCase() === lower))
    return { ok: false, message: `${github} is already in the list` };
  list.push({ github: github.trim(), year, campus });
  await kvSet(KV_KEY, list);
  return { ok: true };
}

export async function updateStudentDetails(
  github: string,
  year?: '1st year' | '2nd year' | '3rd year' | '4th year',
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA'
): Promise<{ ok: boolean; message?: string }> {
  const list = await getStudentsKV();
  const lower = github.toLowerCase().trim();
  const index = list.findIndex((s) => s.github.toLowerCase() === lower);
  if (index === -1) return { ok: false, message: 'Student not found' };
  list[index].year = year;
  list[index].campus = campus;
  await kvSet(KV_KEY, list);
  return { ok: true };
}

/** Admin-only. Nothing automated calls this any more; see the header. */
export async function removeStudent(github: string): Promise<{ ok: boolean }> {
  const list = await getStudentsKV();
  const updated = list.filter((s) => s.github.toLowerCase() !== github.toLowerCase());
  if (updated.length === list.length) return { ok: false };
  await kvSet(KV_KEY, updated);
  return { ok: true };
}
