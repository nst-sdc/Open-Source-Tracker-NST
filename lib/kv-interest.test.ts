import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => true) }));
import { validateInterestInput, upsertInterestRegistration, interestCsv, type InterestRegistration } from './kv-interest';

describe('validateInterestInput', () => {
  it('normalises name and email and accepts a known batch and campus', () => {
    const r = validateInterestInput({ name: '  Asha   Rao ', email: ' Asha@Example.EDU ', batch: '2nd year', campus: 'ADYPU' });
    expect(r).toEqual({ ok: true, input: { name: 'Asha Rao', email: 'asha@example.edu', batch: '2nd year', campus: 'ADYPU' } });
  });
  it('rejects a short name, a bad email, and unknown batch or campus', () => {
    expect(validateInterestInput({ name: 'A', email: 'a@b.co', batch: '1st year', campus: 'SMRU' })).toMatchObject({ ok: false });
    expect(validateInterestInput({ name: 'Asha', email: 'not-an-email', batch: '1st year', campus: 'SMRU' })).toMatchObject({ ok: false });
    expect(validateInterestInput({ name: 'Asha', email: 'a@b.co', batch: '5th year', campus: 'SMRU' })).toMatchObject({ ok: false });
    expect(validateInterestInput({ name: 'Asha', email: 'a@b.co', batch: '1st year', campus: 'Mars' })).toMatchObject({ ok: false });
    expect(validateInterestInput(null)).toMatchObject({ ok: false });
  });
});

describe('upsertInterestRegistration', () => {
  const input = { name: 'Asha Rao', email: 'asha@example.edu', batch: '2nd year' as const, campus: 'ADYPU' as const };
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
    expect(lines[0]).toBe('name,email,github,batch,campus,registered_at,updated_at,github_id');
    expect(lines[1]).toContain(',1');
    expect(lines[2].startsWith('"Rao, Asha ""AR""",')).toBe(true);
  });
});
