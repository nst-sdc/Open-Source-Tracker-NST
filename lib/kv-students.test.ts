import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvRead: vi.fn(async () => ({ ok: true, value: null })), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => {}) }));
const mod = await import('./kv-students');
const kv = await import('./kv');
const { applyUpdates, findStudent } = mod;
import type { Student } from './kv-students';
import { mergeImport } from './kv-students';

const roster = (): Student[] => [
  { github: 'Alice', year: '2nd year', campus: 'Rishihood' },
  { github: 'bob', githubId: 2 },
  { github: 'carol', unresolvedSince: '2026-01-01T00:00:00.000Z' },
];

describe('applyUpdates', () => {
  it('records the GitHub id without touching anything else', () => {
    const { list, changed } = applyUpdates(roster(), [{ type: 'id', github: 'alice', githubId: 1 }]);
    expect(changed).toBe(true);
    expect(list[0]).toEqual({ github: 'Alice', year: '2nd year', campus: 'Rishihood', githubId: 1 });
    expect(list).toHaveLength(3);
  });

  it('is a no-op when nothing new is learned', () => {
    const { changed, list } = applyUpdates(roster(), [{ type: 'id', github: 'bob', githubId: 2 }, { type: 'id', github: 'nobody', githubId: 9 }]);
    expect(changed).toBe(false);
    expect(list).toEqual(roster());
  });

  it('renames in place and remembers the old login', () => {
    const { list } = applyUpdates(roster(), [{ type: 'rename', github: 'alice', newLogin: 'alice-dev', githubId: 1 }]);
    expect(list[0]).toEqual({ github: 'alice-dev', githubId: 1, year: '2nd year', campus: 'Rishihood', previousLogins: ['Alice'] });
    expect(findStudent(list, 'ALICE')?.github).toBe('alice-dev');
  });

  it('folds a rename onto an already-tracked login into one entry', () => {
    const { list } = applyUpdates(roster(), [{ type: 'rename', github: 'alice', newLogin: 'BOB', githubId: 2 }]);
    expect(list).toHaveLength(2);
    const bob = list.find((s) => s.github === 'bob')!;
    expect(bob.year).toBe('2nd year');
    expect(bob.previousLogins).toEqual(['Alice']);
  });

  it('marks a vanished account unresolved but keeps it on the roster, and clears the mark when it is back', () => {
    const once = applyUpdates(roster(), [{ type: 'unresolved', github: 'bob' }]);
    expect(once.list).toHaveLength(3);
    expect(once.list[1].unresolvedSince).toMatch(/^\d{4}-/);
    const again = applyUpdates(once.list, [{ type: 'unresolved', github: 'bob' }]);
    expect(again.changed).toBe(false);
    const back = applyUpdates(once.list, [{ type: 'resolved', github: 'bob' }, { type: 'id', github: 'carol', githubId: 3 }]);
    expect(back.list[1].unresolvedSince).toBeUndefined();
    expect(back.list[2]).toEqual({ github: 'carol', githubId: 3 });
  });

  it('never mutates its input', () => {
    const input = roster();
    applyUpdates(input, [{ type: 'rename', github: 'alice', newLogin: 'x', githubId: 1 }, { type: 'unresolved', github: 'bob' }]);
    expect(input).toEqual(roster());
  });
});

describe('roster reads and writes against a flaky store', () => {
  const kvRead = kv.kvRead as unknown as ReturnType<typeof vi.fn>;
  const kvSet = kv.kvSet as unknown as ReturnType<typeof vi.fn>;

  it('seeds from the bundled file only when the store confirms the key is absent', async () => {
    mod._resetRosterMemory();
    kvSet.mockClear();
    kvRead.mockResolvedValueOnce({ ok: true, value: null });
    const list = await mod.getStudentsKV();
    expect(list.length).toBeGreaterThan(1000);
    expect(kvSet).toHaveBeenCalledTimes(1);
    expect(kvSet.mock.calls[0][0]).toBe('students_list');
  });

  it('never writes when the store did not answer, and serves the last good roster', async () => {
    mod._resetRosterMemory();
    kvSet.mockClear();
    const live = [{ github: 'only-on-live' }, { github: 'added-by-admin' }];
    kvRead.mockResolvedValueOnce({ ok: true, value: live });
    expect(await mod.getStudentsKV()).toEqual(live);
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    expect(await mod.getStudentsKV()).toEqual(live);
    expect(kvSet).not.toHaveBeenCalled();
  });

  it('falls back to the bundled file read-only when nothing better is known', async () => {
    mod._resetRosterMemory();
    kvSet.mockClear();
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    const list = await mod.getStudentsKV();
    expect(list.length).toBeGreaterThan(1000);
    expect(kvSet).not.toHaveBeenCalled();
  });

  it('refuses every mutation while the store is unreachable', async () => {
    kvSet.mockClear();
    kvRead.mockResolvedValue({ ok: false, value: null });
    await expect(mod.addStudent('someone')).rejects.toBeInstanceOf(mod.RosterUnavailableError);
    await expect(mod.removeStudent('someone')).rejects.toBeInstanceOf(mod.RosterUnavailableError);
    await expect(mod.updateStudentDetails('someone', '2nd year')).rejects.toBeInstanceOf(mod.RosterUnavailableError);
    await expect(mod.applyRosterUpdates([{ type: 'unresolved', github: 'someone' }])).rejects.toBeInstanceOf(mod.RosterUnavailableError);
    expect(kvSet).not.toHaveBeenCalled();
    kvRead.mockReset();
  });
});

describe('mergeImport', () => {
  it('adds unknown logins, fills known ones, follows renames, normalises, and never removes', () => {
    const roster = [
      { github: 'Asha', year: '1st year' as const },
      { github: 'ravi-new', previousLogins: ['ravi'], campus: 'ADYPU' as const },
      { github: 'untouched', name: 'Keep Me' },
    ];
    const r = mergeImport(roster, [
      { github: 'asha', name: '  Asha   Rao ', email: 'ASHA@nst.rishihood.edu.in', year: '4th year', campus: 'Rishihood' },
      { github: 'https://github.com/ravi', email: 'ravi@x.edu', year: '4th year', campus: 'Rishihood' },
      { github: '@newbie', name: 'New Bie', email: 'n@x.edu', year: '4th year', campus: 'Rishihood' },
      { github: 'not a login!', name: 'X' },
      { github: 'asha', name: 'dup' },
    ]);
    expect(r.added).toEqual(['newbie']);
    expect(r.updated.sort()).toEqual(['Asha', 'ravi-new']);
    expect(r.unchanged).toEqual([]);
    expect(r.skipped).toEqual(['not a login!', 'asha']);
    expect(r.list).toHaveLength(4);
    expect(r.list[0]).toEqual({ github: 'Asha', year: '4th year', campus: 'Rishihood', name: 'Asha Rao', email: 'asha@nst.rishihood.edu.in' });
    expect(r.list[1]).toMatchObject({ github: 'ravi-new', email: 'ravi@x.edu', year: '4th year', campus: 'Rishihood' });
    expect(r.list[2]).toEqual({ github: 'untouched', name: 'Keep Me' });
    expect(mergeImport(r.list, [{ github: 'asha', name: 'Asha Rao' }]).unchanged).toEqual(['Asha']);
  });
});
