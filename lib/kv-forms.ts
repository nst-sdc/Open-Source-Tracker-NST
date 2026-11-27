/**
 * lib/kv-forms.ts — storage for admin-defined forms and their responses.
 *
 * Keys: `forms` (FormDef[], admin-only writes) and `form_resp:<slug>`, a
 * hash of GitHub id -> response JSON. One response per GitHub account per
 * form, keyed on the numeric id so a rename cannot duplicate it. Identity
 * always comes from the session.
 *
 * The hash matters: HSET of one field is atomic in the store, so two
 * students submitting in the same instant on different pods cannot
 * overwrite each other, which a read-modify-write of one JSON list would.
 * Roster additions still rewrite the roster list, so they run under a
 * short lock and are reconciled by the refresh tick (reconcileRosterForForms)
 * in case the lock was busy.
 */
import { kvDel, kvGet, kvSet } from './kv';
import { hashEntries, runCommands, withLock } from './kv-commands';
import { addStudent, getStudentsKV, findStudent, updateStudentDetails, RosterUnavailableError } from './kv-students';
import { DEFAULT_FORMS, rosterDetails, type FormDef, type FormResponse, type RosterCampus, type RosterYear } from './form-defs';

export const FORMS_KEY = 'forms';
export const responsesKey = (slug: string) => `form_resp:${slug}`;
/** The pre-hash list key, carried over on first read. */
const legacyListKey = (slug: string) => `form_responses:${slug}`;

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
  await runCommands([['DEL', responsesKey(slug)]]);
  await kvDel(legacyListKey(slug));
  return { ok: true };
}

interface LegacyInterest { githubId: number; github: string; avatarUrl?: string; name: string; email: string; batch: string; campus: string; channel?: string; createdAt: string; updatedAt: string; rosterAddedAt?: string }
const LEGACY_CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', gchat: 'Google Spaces', email: 'Email' };

const parseRow = (raw: string): FormResponse | null => {
  try {
    const r = JSON.parse(raw) as FormResponse;
    return r && typeof r === 'object' && typeof r.githubId === 'number' ? r : null;
  } catch {
    return null;
  }
};

async function writeRows(slug: string, rows: FormResponse[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const { ok } = await runCommands([['HSET', responsesKey(slug), ...rows.flatMap((r) => [String(r.githubId), JSON.stringify(r)])]]);
  return ok;
}

/** Rows written before the hash existed (a JSON list, or the interest form's own key), moved over once. */
async function migrateLegacy(slug: string): Promise<FormResponse[]> {
  const list = await kvGet<FormResponse[]>(legacyListKey(slug));
  if (Array.isArray(list) && list.length > 0) {
    if (await writeRows(slug, list)) await kvDel(legacyListKey(slug));
    return list;
  }
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
      if (await writeRows(slug, rows)) await kvDel('interest_registrations');
      return rows;
    }
  }
  return [];
}

export async function getResponses(slug: string): Promise<FormResponse[]> {
  const { ok, results } = await runCommands([['HGETALL', responsesKey(slug)]]);
  if (!ok) return [];
  const rows = Object.values(hashEntries(results[0])).map(parseRow).filter((r): r is FormResponse => r !== null);
  if (rows.length > 0) return rows;
  return migrateLegacy(slug);
}

export async function findResponse(slug: string, githubId: number): Promise<FormResponse | null> {
  const { ok, results } = await runCommands([['HGET', responsesKey(slug), String(githubId)]]);
  if (!ok) return null;
  if (typeof results[0] === 'string') return parseRow(results[0]);
  // An empty hash may mean rows not yet carried over.
  return (await getResponses(slug)).find((r) => r.githubId === githubId) ?? null;
}

/**
 * Inserts or updates the signed-in account's response with one HSET, so
 * concurrent submissions from other accounts can never be lost. The io is
 * injectable for tests.
 */
export async function upsertResponse(
  slug: string,
  viewer: { id: number; login: string; avatarUrl?: string },
  answers: Record<string, string>,
  nowIso = new Date().toISOString(),
  io: { read: (githubId: number) => Promise<FormResponse | null>; write: (r: FormResponse) => Promise<boolean> } = {
    read: (githubId) => findResponse(slug, githubId),
    write: (r) => writeRows(slug, [r]),
  },
): Promise<{ ok: true; response: FormResponse; created: boolean } | { ok: false; error: string }> {
  const base = await io.read(viewer.id);
  const response: FormResponse = {
    githubId: viewer.id,
    github: viewer.login,
    avatarUrl: viewer.avatarUrl || base?.avatarUrl,
    answers,
    createdAt: base?.createdAt ?? nowIso,
    updatedAt: nowIso,
    ...(base?.rosterAddedAt ? { rosterAddedAt: base.rosterAddedAt } : {}),
  };
  if (!(await io.write(response))) return { ok: false, error: 'The store did not accept your response. Please try again.' };
  return { ok: true, response, created: base === null };
}

export async function removeResponse(slug: string, githubId: number): Promise<{ ok: boolean; removed: boolean }> {
  await getResponses(slug); // carries legacy rows over first, so the delete is real
  const { ok, results } = await runCommands([['HDEL', responsesKey(slug), String(githubId)]]);
  return { ok, removed: Number(results[0]) > 0 };
}

export async function markRosterAdded(slug: string, githubId: number, nowIso = new Date().toISOString()): Promise<void> {
  const row = await findResponse(slug, githubId);
  if (!row || row.rosterAddedAt) return;
  await writeRows(slug, [{ ...row, rosterAddedAt: nowIso }]);
}

/** The lock every roster list rewrite from a form takes; see withLock. */
export const ROSTER_LOCK = 'roster';
const ROSTER_LOCK_TTL_MS = 5000;

/**
 * Puts the account on the roster if it is not there, with the year and
 * campus the form collected; fills only the fields the roster lacks for a
 * student already on it. The roster is one list rewritten whole, so this
 * runs under a short lock; if the lock stays busy the add is 'deferred'
 * and reconcileRosterForForms does it on the next refresh tick. Never
 * throws for a roster outage.
 */
export async function ensureOnRoster(
  login: string,
  answers: Record<string, string>,
  deps = { getStudentsKV, addStudent, updateStudentDetails },
  lock: typeof withLock = withLock,
): Promise<'added' | 'already' | 'updated' | 'unavailable' | 'deferred'> {
  const { year, campus } = rosterDetails(answers);
  try {
    // Name and college email from the form go on the roster too, so the
    // admin page shows who is who; blanks are ignored by the roster.
    const contact = { name: answers.name, email: answers.email };
    const result = await lock(ROSTER_LOCK, ROSTER_LOCK_TTL_MS, async () => {
      const existing = findStudent(await deps.getStudentsKV(), login);
      if (!existing) {
        const res = await deps.addStudent(login, year, campus, contact);
        return res.ok ? 'added' : 'already';
      }
      const needsContact = (!existing.name && contact.name) || (!existing.email && contact.email);
      if ((existing.year || !year) && (existing.campus || !campus) && !needsContact) return 'already';
      const res = await deps.updateStudentDetails(login, (existing.year ?? year) as RosterYear | undefined, (existing.campus ?? campus) as RosterCampus | undefined, contact);
      return res.ok ? 'updated' : 'already';
    });
    return result ?? 'deferred';
  } catch (err) {
    if (err instanceof RosterUnavailableError) return 'unavailable';
    throw err;
  }
}

/**
 * Safety net for add-to-roster forms: every response whose account is not
 * on the roster gets added now (a submission that was deferred by a busy
 * lock, or a roster outage at the time). Called by the refresh tick.
 */
export async function reconcileRosterForForms(
  deps = { getStudentsKV, addStudent, updateStudentDetails },
  lock: typeof withLock = withLock,
): Promise<{ checked: number; added: number; deferred: number }> {
  const out = { checked: 0, added: 0, deferred: 0 };
  const forms = (await getForms()).filter((f) => f.addToRoster);
  if (forms.length === 0) return out;
  const roster = new Set((await deps.getStudentsKV()).map((s) => s.github.toLowerCase()));
  for (const form of forms) {
    for (const r of await getResponses(form.slug)) {
      out.checked++;
      if (roster.has(r.github.toLowerCase())) continue;
      const result = await ensureOnRoster(r.github, r.answers, deps, lock);
      if (result === 'added') {
        out.added++;
        roster.add(r.github.toLowerCase());
        await markRosterAdded(form.slug, r.githubId);
      } else if (result === 'deferred' || result === 'unavailable') {
        out.deferred++;
      }
    }
  }
  return out;
}
