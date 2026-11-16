import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => {}) }));
const { applyUpdates, findStudent } = await import('./kv-students');
import type { Student } from './kv-students';

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
