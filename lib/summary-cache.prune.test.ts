import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => {}) }));
const { pruneToRoster } = await import('./summary-cache');

const sum = (login: string) => ({ profile: { login }, scoreMergedPRs: 0 });

describe('pruneToRoster', () => {
  it('drops summaries whose login left the roster, case-insensitively', () => {
    const out = pruneToRoster([sum('Dreamstick9'), sum('adityamathur5836'), sum('geetesh-learner')], [{ github: 'dreamstick9' }, { github: 'Geetesh-Learner' }]);
    expect(out.map((s) => s.profile.login)).toEqual(['Dreamstick9', 'geetesh-learner']);
  });
  it('keeps order and returns a new array', () => {
    const input = [sum('b'), sum('a')];
    const out = pruneToRoster(input, [{ github: 'a' }, { github: 'b' }]);
    expect(out).toEqual(input); expect(out).not.toBe(input);
  });
  it('an empty roster empties the board rather than showing strangers', () => {
    expect(pruneToRoster([sum('x')], [])).toEqual([]);
  });
});
