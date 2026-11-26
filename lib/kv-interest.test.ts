import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => true) }));
import { validateInterestInput, upsertInterestRegistration, interestCsv, ensureOnRoster, removeInterestRegistration, type InterestRegistration } from './kv-interest';
import { RosterUnavailableError, type Student } from './kv-students';

describe('validateInterestInput', () => {
  it('normalises name and email and accepts a known batch and campus', () => {
    const r = validateInterestInput({ name: '  Asha   Rao ', email: ' Asha@Example.EDU ', batch: '2nd year', campus: 'ADYPU', channel: 'whatsapp' });
    expect(r).toEqual({ ok: true, input: { name: 'Asha Rao', email: 'asha@example.edu', batch: '2nd year', campus: 'ADYPU', channel: 'whatsapp' } });
  });
  it('rejects a short name, a bad email, an unknown batch, campus or channel', () => {
    const ok = { name: 'Asha', email: 'a@b.co', batch: '1st year', campus: 'SMRU', channel: 'email' };
    expect(validateInterestInput({ ...ok, name: 'A' })).toMatchObject({ ok: false });
    expect(validateInterestInput({ ...ok, email: 'not-an-email' })).toMatchObject({ ok: false });
    expect(validateInterestInput({ ...ok, batch: '5th year' })).toMatchObject({ ok: false });
    expect(validateInterestInput({ ...ok, campus: 'Mars' })).toMatchObject({ ok: false });
    expect(validateInterestInput({ ...ok, channel: 'pigeon' })).toMatchObject({ ok: false });
    expect(validateInterestInput({ ...ok, channel: undefined })).toMatchObject({ ok: false });
    expect(validateInterestInput(null)).toMatchObject({ ok: false });
  });
});

describe('upsertInterestRegistration', () => {
  const input = { name: 'Asha Rao', email: 'asha@example.edu', batch: '2nd year' as const, campus: 'ADYPU' as const, channel: 'gchat' as const };
  it('creates a row keyed on the GitHub id and updates it in place on a second submit, keeping createdAt', async () => {
    let store: InterestRegistration[] = [];
    const io = { read: async () => store, write: async (l: InterestRegistration[]) => { store = l; return true; } };
    const first = await upsertInterestRegistration({ id: 7, login: 'asha', avatarUrl: 'a.png' }, input, '2026-11-30T09:00:00Z', io);
    expect(first).toMatchObject({ ok: true, created: true, registration: { githubId: 7, github: 'asha', createdAt: '2026-11-30T09:00:00Z' } });
    // Renamed on GitHub and changed campus: same row, new login, original createdAt.
    const second = await upsertInterestRegistration({ id: 7, login: 'asha-rao', avatarUrl: '' }, { ...input, campus: 'SMRU' }, '2026-12-01T09:00:00Z', io);
    expect(second).toMatchObject({ ok: true, created: false, registration: { github: 'asha-rao', campus: 'SMRU', avatarUrl: 'a.png', createdAt: '2026-11-30T09:00:00Z', updatedAt: '2026-12-01T09:00:00Z' } });
    expect(store).toHaveLength(1);
  });
  it('reports a store that refuses the write', async () => {
    const io = { read: async () => [], write: async () => false };
    expect(await upsertInterestRegistration({ id: 1, login: 'x' }, input, undefined, io)).toMatchObject({ ok: false });
  });
});

describe('interestCsv', () => {
  it('quotes commas and quotes, and orders oldest first', () => {
    const row = (over: Partial<InterestRegistration>): InterestRegistration => ({
      githubId: 1, github: 'g', name: 'N', email: 'e@x.io', batch: '1st year', campus: 'SMRU', createdAt: '2026-11-30T09:00:00Z', updatedAt: '2026-11-30T09:00:00Z', ...over,
    });
    const csv = interestCsv([row({ githubId: 2, createdAt: '2026-12-01T00:00:00Z', name: 'Rao, Asha "AR"' }), row({ githubId: 1 })]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('name,email,github,batch,campus,reads_messages_on,registered_at,updated_at,github_id');
    expect(lines[1]).toContain(',1');
    expect(lines[2].startsWith('"Rao, Asha ""AR""",')).toBe(true);
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
  it('adds an unknown account with batch and campus', async () => {
    const d = deps([]);
    expect(await ensureOnRoster('asha', '2nd year', 'ADYPU', d)).toBe('added');
    expect(d.calls).toEqual(['add asha 2nd year ADYPU']);
  });
  it('leaves a fully classified student alone and fills only missing fields otherwise', async () => {
    const full = deps([{ github: 'Asha', year: '1st year', campus: 'SMRU' }]);
    expect(await ensureOnRoster('asha', '2nd year', 'ADYPU', full)).toBe('already');
    expect(full.calls).toEqual([]);
    const partial = deps([{ github: 'asha', year: '1st year' }]);
    expect(await ensureOnRoster('asha', '2nd year', 'ADYPU', partial)).toBe('updated');
    expect(partial.calls).toEqual(['update asha 1st year ADYPU']);
  });
  it('reports an unavailable roster instead of throwing', async () => {
    const d = { ...deps([]), getStudentsKV: async () => { throw new RosterUnavailableError(); } };
    expect(await ensureOnRoster('asha', '2nd year', 'ADYPU', d)).toBe('unavailable');
  });
});

describe('removeInterestRegistration', () => {
  it('drops only the matching account and reports whether anything was removed', async () => {
    const kv = await import('./kv');
    const row = (githubId: number): InterestRegistration => ({ githubId, github: `u${githubId}`, name: 'N', email: 'e@x.io', batch: '1st year', campus: 'SMRU', channel: 'email', createdAt: '2026-11-30T09:00:00Z', updatedAt: '2026-11-30T09:00:00Z' });
    (kv.kvGet as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([row(1), row(2)]);
    expect(await removeInterestRegistration(1)).toEqual({ ok: true, removed: true });
    expect((kv.kvSet as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[1]).toEqual([row(2)]);
    expect(await removeInterestRegistration(9)).toEqual({ ok: true, removed: false });
  });
});
