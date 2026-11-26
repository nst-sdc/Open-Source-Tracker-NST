/**
 * lib/kv-interest.ts
 *
 * The open-source interest form: one registration per GitHub account,
 * keyed on GitHub's immutable numeric id so a username rename cannot make
 * a duplicate. Identity (id, login, avatar) always comes from the signed-in
 * session, never from the request body; the body supplies only what GitHub
 * does not know: name as the student wants it, college email, batch and
 * campus. Re-submitting updates the existing row in place.
 */
import { kvGet, kvSet } from './kv';
import { addStudent, getStudentsKV, findStudent, updateStudentDetails, RosterUnavailableError } from './kv-students';
import { type InterestInput, type InterestRegistration } from './interest-form';

export * from './interest-form';

export const KV_KEY = 'interest_registrations';

export async function getInterestRegistrations(): Promise<InterestRegistration[]> {
  const list = await kvGet<InterestRegistration[]>(KV_KEY);
  return Array.isArray(list) ? list : [];
}

export async function findInterestRegistration(githubId: number): Promise<InterestRegistration | null> {
  return (await getInterestRegistrations()).find((r) => r.githubId === githubId) ?? null;
}

/**
 * Inserts or updates the signed-in account's registration. Returns the
 * stored row and whether it was new. Exported with an injectable list
 * reader/writer so the merge rule is testable without the store.
 */
export async function upsertInterestRegistration(
  viewer: { id: number; login: string; avatarUrl?: string },
  input: InterestInput,
  nowIso = new Date().toISOString(),
  io: { read: () => Promise<InterestRegistration[]>; write: (list: InterestRegistration[]) => Promise<boolean> } = {
    read: getInterestRegistrations,
    write: (list) => kvSet(KV_KEY, list),
  },
): Promise<{ ok: true; registration: InterestRegistration; created: boolean } | { ok: false; error: string }> {
  const list = await io.read();
  const i = list.findIndex((r) => r.githubId === viewer.id);
  const base = i >= 0 ? list[i] : null;
  const registration: InterestRegistration = {
    githubId: viewer.id,
    github: viewer.login,
    avatarUrl: viewer.avatarUrl || base?.avatarUrl,
    ...input,
    createdAt: base?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  if (i >= 0) list[i] = registration;
  else list.push(registration);
  if (!(await io.write(list))) return { ok: false, error: 'The store did not accept the registration. Please try again.' };
  return { ok: true, registration, created: i < 0 };
}

/**
 * Every account that registers goes on the roster, so the tracker starts
 * counting their work without an admin approving a join request. A student
 * already on the roster keeps their row; batch and campus are filled in
 * only where the roster had none, so an admin's classification is never
 * overwritten by a self-report. Never throws for a roster outage: the
 * registration itself must not be lost over it.
 */
export async function ensureOnRoster(
  login: string,
  batch: InterestInput['batch'],
  campus: InterestInput['campus'],
  deps = { getStudentsKV, addStudent, updateStudentDetails },
): Promise<'added' | 'already' | 'updated' | 'unavailable'> {
  try {
    const existing = findStudent(await deps.getStudentsKV(), login);
    if (!existing) {
      const res = await deps.addStudent(login, batch, campus);
      return res.ok ? 'added' : 'already';
    }
    if (existing.year && existing.campus) return 'already';
    const res = await deps.updateStudentDetails(login, existing.year ?? batch, existing.campus ?? campus);
    return res.ok ? 'updated' : 'already';
  } catch (err) {
    if (err instanceof RosterUnavailableError) return 'unavailable';
    throw err;
  }
}

/** Stamps rosterAddedAt on the account's row; a no-op without a row or if already stamped. */
export async function markRosterAdded(githubId: number, nowIso = new Date().toISOString()): Promise<void> {
  const list = await getInterestRegistrations();
  const row = list.find((r) => r.githubId === githubId);
  if (!row || row.rosterAddedAt) return;
  row.rosterAddedAt = nowIso;
  await kvSet(KV_KEY, list);
}

/** Admin-only: drops the account's registration (test rows, withdrawals). The roster is untouched. */
export async function removeInterestRegistration(githubId: number): Promise<{ ok: boolean; removed: boolean }> {
  const list = await getInterestRegistrations();
  const kept = list.filter((r) => r.githubId !== githubId);
  if (kept.length === list.length) return { ok: true, removed: false };
  return { ok: await kvSet(KV_KEY, kept), removed: true };
}
