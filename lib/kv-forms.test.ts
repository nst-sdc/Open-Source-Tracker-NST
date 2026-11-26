import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => {
  let mem: Record<string, unknown> = {};
  return {
    kvConfigured: () => false,
    kvPipeline: vi.fn(),
    kvGet: vi.fn(async (k: string) => mem[k] ?? null),
    kvSet: vi.fn(async (k: string, v: unknown) => { mem[k] = JSON.parse(JSON.stringify(v)); return true; }),
    kvDel: vi.fn(async (k: string) => { delete mem[k]; return true; }),
    __reset: () => { mem = {}; },
  };
});
vi.mock('./kv-students', async () => {
  const actual = await vi.importActual<typeof import('./kv-students')>('./kv-students');
  return { ...actual, getStudentsKV: vi.fn(async () => []), addStudent: vi.fn(async () => ({ ok: true })), updateStudentDetails: vi.fn(async () => ({ ok: true })) };
});
import { getForms, getForm, saveForm, deleteForm, getResponses, findResponse, upsertResponse, removeResponse, ensureOnRoster, markRosterAdded, reconcileRosterForForms } from './kv-forms';
import { RosterUnavailableError, type Student } from './kv-students';
import type { FormResponse } from './form-defs';
const kv = await import('./kv');

describe('forms store', () => {
  it('seeds the interest form, saves and deletes custom forms, never deletes a built-in one', async () => {
    (kv as unknown as { __reset: () => void }).__reset();
    expect((await getForms()).map((f) => f.slug)).toEqual(['interest']);
    const interest = (await getForm('interest'))!;
    await saveForm({ ...interest, slug: 'hack-day', title: 'Hack day', createdAt: '2026-12-01T00:00:00Z', updatedAt: '2026-12-01T00:00:00Z' });
    expect((await getForms()).map((f) => f.slug)).toEqual(['interest', 'hack-day']);
    await saveForm({ ...interest, title: 'Renamed', createdAt: 'ignored', updatedAt: '2026-12-02T00:00:00Z' });
    expect((await getForm('interest'))!).toMatchObject({ title: 'Renamed', createdAt: interest.createdAt });
    expect(await deleteForm('interest')).toMatchObject({ ok: false });
    expect(await deleteForm('hack-day')).toEqual({ ok: true });
    expect((await getForms()).map((f) => f.slug)).toEqual(['interest']);
  });
  it('carries legacy interest registrations over once, into the hash', async () => {
    (kv as unknown as { __reset: () => void }).__reset();
    await kv.kvSet('interest_registrations', [{ githubId: 7, github: 'asha', name: 'Asha Rao', email: 'a@b.co', batch: '2nd year', campus: 'ADYPU', channel: 'gchat', createdAt: '2026-11-26T10:00:00Z', updatedAt: '2026-11-26T10:00:00Z', rosterAddedAt: '2026-11-26T10:00:00Z' }]);
    const rows = await getResponses('interest');
    expect(rows).toEqual([{ githubId: 7, github: 'asha', answers: { name: 'Asha Rao', email: 'a@b.co', batch: '2nd year', campus: 'ADYPU', channel: 'Google Spaces' }, createdAt: '2026-11-26T10:00:00Z', updatedAt: '2026-11-26T10:00:00Z', rosterAddedAt: '2026-11-26T10:00:00Z' }]);
    expect(await kv.kvGet('interest_registrations')).toBeNull();
    expect(await getResponses('interest')).toHaveLength(1);
    expect((await findResponse('interest', 7))?.github).toBe('asha');
  });
  it('carries a pre-hash JSON list over once', async () => {
    (kv as unknown as { __reset: () => void }).__reset();
    const row: FormResponse = { githubId: 3, github: 'c', answers: { x: '1' }, createdAt: '2026-11-26T10:00:00Z', updatedAt: '2026-11-26T10:00:00Z' };
    await kv.kvSet('form_responses:hack-day', [row]);
    expect(await getResponses('hack-day')).toEqual([row]);
    expect(await kv.kvGet('form_responses:hack-day')).toBeNull();
    expect(await removeResponse('hack-day', 3)).toEqual({ ok: true, removed: true });
    expect(await getResponses('hack-day')).toEqual([]);
  });
});

describe('responses', () => {
  const answers = { name: 'Asha Rao', email: 'asha@example.edu', batch: '2nd year', campus: 'ADYPU', channel: 'WhatsApp' };
  it('creates keyed on the GitHub id and updates in place keeping createdAt and rosterAddedAt', async () => {
    const store = new Map<number, FormResponse>();
    const io = { read: async (id: number) => store.get(id) ?? null, write: async (r: FormResponse) => { store.set(r.githubId, r); return true; } };
    const first = await upsertResponse('interest', { id: 7, login: 'asha', avatarUrl: 'a.png' }, answers, '2026-11-30T09:00:00Z', io);
    expect(first).toMatchObject({ ok: true, created: true, response: { githubId: 7, github: 'asha', createdAt: '2026-11-30T09:00:00Z' } });
    store.set(7, { ...store.get(7)!, rosterAddedAt: '2026-11-30T09:00:01Z' });
    const second = await upsertResponse('interest', { id: 7, login: 'asha-rao', avatarUrl: '' }, { ...answers, campus: 'SMRU' }, '2026-12-01T09:00:00Z', io);
    expect(second).toMatchObject({ ok: true, created: false, response: { github: 'asha-rao', avatarUrl: 'a.png', answers: { campus: 'SMRU' }, createdAt: '2026-11-30T09:00:00Z', updatedAt: '2026-12-01T09:00:00Z', rosterAddedAt: '2026-11-30T09:00:01Z' } });
    expect(store.size).toBe(1);
  });
  it('keeps every response when many accounts submit at the same moment', async () => {
    (kv as unknown as { __reset: () => void }).__reset();
    await Promise.all(Array.from({ length: 40 }, (_, i) => upsertResponse('burst', { id: i + 1, login: `u${i + 1}` }, { x: String(i) })));
    expect((await getResponses('burst')).map((r) => r.githubId).sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });
  it('removeResponse and markRosterAdded work against the store', async () => {
    (kv as unknown as { __reset: () => void }).__reset();
    await upsertResponse('hack-day', { id: 1, login: 'a' }, { x: '1' });
    await upsertResponse('hack-day', { id: 2, login: 'b' }, { x: '2' });
    await markRosterAdded('hack-day', 1, '2026-12-01T00:00:00Z');
    expect((await getResponses('hack-day')).find((r) => r.githubId === 1)?.rosterAddedAt).toBe('2026-12-01T00:00:00Z');
    expect(await removeResponse('hack-day', 1)).toEqual({ ok: true, removed: true });
    expect(await removeResponse('hack-day', 9)).toEqual({ ok: true, removed: false });
    expect((await getResponses('hack-day')).map((r) => r.githubId)).toEqual([2]);
  });
});

describe('ensureOnRoster', () => {
  const deps = (roster: Student[]) => {
    const calls: string[] = [];
    return {
      calls,
      getStudentsKV: async () => roster,
      addStudent: async (g: string, y?: string, c?: string) => { calls.push(`add ${g} ${y} ${c}`); return { ok: true }; },
      updateStudentDetails: async (g: string, y?: string, c?: string) => { calls.push(`update ${g} ${y} ${c}`); return { ok: true }; },
    };
  };
  it('adds an unknown account with the batch and campus answers', async () => {
    const d = deps([]);
    expect(await ensureOnRoster('asha', { batch: '2nd year', campus: 'ADYPU' }, d)).toBe('added');
    expect(d.calls).toEqual(['add asha 2nd year ADYPU']);
  });
  it('leaves a classified student alone, fills only missing fields, ignores answers outside the roster vocab', async () => {
    const full = deps([{ github: 'Asha', year: '1st year', campus: 'SMRU' }]);
    expect(await ensureOnRoster('asha', { batch: '2nd year', campus: 'ADYPU' }, full)).toBe('already');
    expect(full.calls).toEqual([]);
    const partial = deps([{ github: 'asha', year: '1st year' }]);
    expect(await ensureOnRoster('asha', { batch: '2nd year', campus: 'ADYPU' }, partial)).toBe('updated');
    expect(partial.calls).toEqual(['update asha 1st year ADYPU']);
    const odd = deps([{ github: 'asha', year: '1st year' }]);
    expect(await ensureOnRoster('asha', { batch: '2nd year', campus: 'Mars' }, odd)).toBe('already');
  });
  it('reports an unavailable roster instead of throwing', async () => {
    const d = { ...deps([]), getStudentsKV: async () => { throw new RosterUnavailableError(); } };
    expect(await ensureOnRoster('asha', { batch: '2nd year', campus: 'ADYPU' }, d)).toBe('unavailable');
  });
});

describe('roster lock and reconcile', () => {
  const noLock = async <T,>() => null as T | null; // a lock that is always busy
  it('defers the roster add when the lock stays busy, and the reconcile adds them later', async () => {
    (kv as unknown as { __reset: () => void }).__reset();
    const calls: string[] = [];
    const roster: Student[] = [];
    const deps = {
      getStudentsKV: async () => roster,
      addStudent: async (g: string, y?: string, c?: string) => { calls.push(`add ${g} ${y} ${c}`); roster.push({ github: g, year: y as Student['year'], campus: c as Student['campus'] }); return { ok: true }; },
      updateStudentDetails: async () => ({ ok: true }),
    };
    await upsertResponse('interest', { id: 11, login: 'late' }, { name: 'L', batch: '1st year', campus: 'SMRU' });
    expect(await ensureOnRoster('late', { batch: '1st year', campus: 'SMRU' }, deps, noLock)).toBe('deferred');
    expect(calls).toEqual([]);
    const r = await reconcileRosterForForms(deps);
    expect(r).toEqual({ checked: 1, added: 1, deferred: 0 });
    expect(calls).toEqual(['add late 1st year SMRU']);
    expect((await findResponse('interest', 11))?.rosterAddedAt).toBeTruthy();
    expect(await reconcileRosterForForms(deps)).toEqual({ checked: 1, added: 0, deferred: 0 });
  });
});
