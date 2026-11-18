import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', async () => {
  const actual = await vi.importActual<typeof import('./kv')>('./kv');
  return { ...actual, kvRead: vi.fn(async () => ({ ok: true, value: null })), kvSet: vi.fn(async () => true), kvGet: vi.fn(async () => null), kvDel: vi.fn(async () => true) };
});
const kv = await import('./kv');
const repo = await import('./repo-cache');
const flagged = await import('./flagged');
const own = await import('./kv-own-repo-exceptions');
const kvRead = kv.kvRead as unknown as ReturnType<typeof vi.fn>;
const kvSet = kv.kvSet as unknown as ReturnType<typeof vi.fn>;

describe('exclusion data never degrades to "exclude nothing"', () => {
  it('repo cache: confirmed miss is {}, failure serves the last good map, failure with nothing known throws', async () => {
    repo._resetRepoCacheMemory();
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    await expect(repo.getRepoCache()).rejects.toBeInstanceOf(kv.StoreUnavailableError);
    kvRead.mockResolvedValueOnce({ ok: true, value: null });
    expect(await repo.getRepoCache()).toEqual({});
    const map = { 'a/b': { valid: false } };
    kvRead.mockResolvedValueOnce({ ok: true, value: map });
    expect(await repo.getRepoCache()).toEqual(map);
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    expect(await repo.getRepoCache()).toEqual(map);
  });

  it('flagged PRs: a failed read is never replaced by the seed file', async () => {
    kvSet.mockClear();
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    await expect(flagged.getFlaggedPRs()).rejects.toBeInstanceOf(kv.StoreUnavailableError);
    expect(kvSet).not.toHaveBeenCalled();
    kvRead.mockResolvedValueOnce({ ok: true, value: [{ id: 'x/y#1' }] });
    expect(await flagged.getFlaggedPRIdSet()).toEqual(new Set(['x/y#1']));
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    expect(await flagged.getFlaggedPRIdSet()).toEqual(new Set(['x/y#1']));
  });

  it('own-repo exceptions: same contract', async () => {
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    await expect(own.getOwnRepoExceptions()).rejects.toBeInstanceOf(kv.StoreUnavailableError);
    kvRead.mockResolvedValueOnce({ ok: true, value: null });
    expect(await own.getOwnRepoExceptions()).toEqual([]);
  });
});
