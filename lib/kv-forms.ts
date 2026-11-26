/**
 * lib/kv-forms.ts — storage for admin-defined forms and their responses.
 *
 * Keys: `forms` (FormDef[]) and `form_responses:<slug>` (FormResponse[]).
 * One response per GitHub account per form, keyed on the numeric id so a
 * rename cannot duplicate it. Identity always comes from the session.
 */
import { kvGet, kvSet } from './kv';
import { addStudent, getStudentsKV, findStudent, updateStudentDetails, RosterUnavailableError } from './kv-students';
import { DEFAULT_FORMS, rosterDetails, type FormDef, type FormResponse, type RosterCampus, type RosterYear } from './form-defs';

export const FORMS_KEY = 'forms';
export const responsesKey = (slug: string) => `form_responses:${slug}`;

/** Every definition; seeds the defaults the first time, so /interest exists on day one. */
export async function getForms(): Promise<FormDef[]> {
  const list = await kvGet<FormDef[]>(FORMS_KEY);
  const forms = Array.isArray(list) ? list : [];
  const missing = DEFAULT_FORMS.filter((d) => !forms.some((f) => f.slug === d.slug));
  if (missing.length === 0) return forms;
  const seeded = [...forms, ...missing];
  await kvSet(FORMS_KEY, seeded);
  return seeded;
}

export async function getForm(slug: string): Promise<FormDef | null> {
  return (await getForms()).find((f) => f.slug === slug) ?? null;
}

export async function saveForm(def: FormDef): Promise<boolean> {
  const forms = await getForms();
  const i = forms.findIndex((f) => f.slug === def.slug);
  if (i >= 0) forms[i] = { ...def, createdAt: forms[i].createdAt };
  else forms.push(def);
  return kvSet(FORMS_KEY, forms);
}

/** Removes the definition and its responses. Default forms cannot be deleted, only closed. */
export async function deleteForm(slug: string): Promise<{ ok: boolean; error?: string }> {
  if (DEFAULT_FORMS.some((d) => d.slug === slug)) return { ok: false, error: 'This form is built in; close it instead.' };
  const forms = await getForms();
  const kept = forms.filter((f) => f.slug !== slug);
  if (kept.length === forms.length) return { ok: false, error: 'No such form.' };
  if (!(await kvSet(FORMS_KEY, kept))) return { ok: false, error: 'The store did not accept the change.' };
  await kvSet(responsesKey(slug), []);
  return { ok: true };
}

interface LegacyInterest { githubId: number; github: string; avatarUrl?: string; name: string; email: string; batch: string; campus: string; channel?: string; createdAt: string; updatedAt: string; rosterAddedAt?: string }
const LEGACY_CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', gchat: 'Google Spaces', email: 'Email' };

export async function getResponses(slug: string): Promise<FormResponse[]> {
  const list = await kvGet<FormResponse[]>(responsesKey(slug));
  if (Array.isArray(list)) return list;
  // The interest form predates this module; carry its rows over once.
  if (slug === 'interest') {
    const legacy = await kvGet<LegacyInterest[]>('interest_registrations');
    if (Array.isArray(legacy) && legacy.length > 0) {
      const rows: FormResponse[] = legacy.map((r) => ({
        githubId: r.githubId,
        github: r.github,
        avatarUrl: r.avatarUrl,
        answers: { name: r.name, email: r.email, batch: r.batch, campus: r.campus, ...(r.channel ? { channel: LEGACY_CHANNEL[r.channel] ?? r.channel } : {}) },
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        ...(r.rosterAddedAt ? { rosterAddedAt: r.rosterAddedAt } : {}),
      }));
      await kvSet(responsesKey(slug), rows);
      return rows;
    }
  }
  return [];
}

export async function findResponse(slug: string, githubId: number): Promise<FormResponse | null> {
  return (await getResponses(slug)).find((r) => r.githubId === githubId) ?? null;
}

/** Inserts or updates the signed-in account's response; the io is injectable for tests. */
export async function upsertResponse(
  slug: string,
  viewer: { id: number; login: string; avatarUrl?: string },
  answers: Record<string, string>,
  nowIso = new Date().toISOString(),
  io: { read: () => Promise<FormResponse[]>; write: (list: FormResponse[]) => Promise<boolean> } = {
    read: () => getResponses(slug),
    write: (list) => kvSet(responsesKey(slug), list),
  },
): Promise<{ ok: true; response: FormResponse; created: boolean } | { ok: false; error: string }> {
  const list = await io.read();
  const i = list.findIndex((r) => r.githubId === viewer.id);
  const base = i >= 0 ? list[i] : null;
  const response: FormResponse = {
    githubId: viewer.id,
    github: viewer.login,
    avatarUrl: viewer.avatarUrl || base?.avatarUrl,
    answers,
    createdAt: base?.createdAt ?? nowIso,
    updatedAt: nowIso,
    ...(base?.rosterAddedAt ? { rosterAddedAt: base.rosterAddedAt } : {}),
  };
  if (i >= 0) list[i] = response;
  else list.push(response);
  if (!(await io.write(list))) return { ok: false, error: 'The store did not accept your response. Please try again.' };
  return { ok: true, response, created: i < 0 };
}

export async function removeResponse(slug: string, githubId: number): Promise<{ ok: boolean; removed: boolean }> {
  const list = await getResponses(slug);
  const kept = list.filter((r) => r.githubId !== githubId);
  if (kept.length === list.length) return { ok: true, removed: false };
  return { ok: await kvSet(responsesKey(slug), kept), removed: true };
}

export async function markRosterAdded(slug: string, githubId: number, nowIso = new Date().toISOString()): Promise<void> {
  const list = await getResponses(slug);
  const row = list.find((r) => r.githubId === githubId);
  if (!row || row.rosterAddedAt) return;
  row.rosterAddedAt = nowIso;
  await kvSet(responsesKey(slug), list);
}

/**
 * Puts the account on the roster if it is not there, with the year and
 * campus the form collected; fills only the fields the roster lacks for a
 * student already on it. Never throws for a roster outage.
 */
export async function ensureOnRoster(
  login: string,
  answers: Record<string, string>,
  deps = { getStudentsKV, addStudent, updateStudentDetails },
): Promise<'added' | 'already' | 'updated' | 'unavailable'> {
  const { year, campus } = rosterDetails(answers);
  try {
    const existing = findStudent(await deps.getStudentsKV(), login);
    if (!existing) {
      const res = await deps.addStudent(login, year, campus);
      return res.ok ? 'added' : 'already';
    }
    if ((existing.year || !year) && (existing.campus || !campus)) return 'already';
    const res = await deps.updateStudentDetails(login, (existing.year ?? year) as RosterYear | undefined, (existing.campus ?? campus) as RosterCampus | undefined);
    return res.ok ? 'updated' : 'already';
  } catch (err) {
    if (err instanceof RosterUnavailableError) return 'unavailable';
    throw err;
  }
}
