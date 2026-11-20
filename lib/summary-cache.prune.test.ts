import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvRead: vi.fn(async () => ({ ok: true, value: null })), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => {}) }));
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

describe('writeSummaryCache', () => {
  it('throws when the store rejects the write instead of reporting success', async () => {
    const kv = await import('./kv');
    const { writeSummaryCache, SummaryCacheWriteError } = await import('./summary-cache');
    const kvSet = kv.kvSet as unknown as ReturnType<typeof vi.fn>;
    kvSet.mockResolvedValueOnce(false);
    await expect(writeSummaryCache([], 'all')).rejects.toBeInstanceOf(SummaryCacheWriteError);
    kvSet.mockResolvedValueOnce(true);
    await expect(writeSummaryCache([], 'all')).resolves.toBeUndefined();
  });
});

describe('invalidateSummaryCache', () => {
  it('stamps every stored period with the epoch, not the current time', async () => {
    const kv = await import('./kv');
    const { invalidateSummaryCache, INVALIDATED_AT } = await import('./summary-cache');
    const kvGet = kv.kvGet as unknown as ReturnType<typeof vi.fn>;
    const kvSet = kv.kvSet as unknown as ReturnType<typeof vi.fn>;
    kvSet.mockClear();
    kvGet.mockImplementation(async (key: string) => (key === 'summary_cache:all' || key === 'summary_cache:week' ? { cachedAt: '2026-11-20T10:00:00.000Z', summaries: [{ profile: { login: 'x' } }] } : null));
    await invalidateSummaryCache();
    const writes = kvSet.mock.calls.filter(([k]) => String(k).startsWith('summary_cache:'));
    expect(writes.map(([k]) => k).sort()).toEqual(['summary_cache:all', 'summary_cache:week']);
    for (const [, value] of writes) expect((value as { cachedAt: string }).cachedAt).toBe(INVALIDATED_AT);
    expect((writes[0][1] as { summaries: unknown[] }).summaries).toHaveLength(1);
    kvGet.mockReset(); kvGet.mockResolvedValue(null);
  });
});
