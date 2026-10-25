import { describe, it, expect, vi, beforeEach } from 'vitest';

const memoryKv: Record<string, unknown> = {};
vi.mock('./kv', () => ({
  kvGet: vi.fn(async (key: string) => (key in memoryKv ? JSON.parse(JSON.stringify(memoryKv[key])) : null)),
  kvSet: vi.fn(async (key: string, val: unknown) => { memoryKv[key] = JSON.parse(JSON.stringify(val)); return true; }),
  kvDel: vi.fn(async (key: string) => { delete memoryKv[key]; }),
}));

const { writeProfileCache, readProfileCache } = await import('./profile-cache');

const user = { login: 'Dreamstick9', avatar_url: '', html_url: '' } as never;
const pr = (number: number, updated_at: string, merged: boolean) =>
  ({
    id: number, number, title: `pr ${number}`, state: merged ? 'closed' : 'open',
    html_url: `https://github.com/kyverno/kyverno/pull/${number}`,
    repository_url: 'https://api.github.com/repos/kyverno/kyverno',
    created_at: '2026-10-01T00:00:00Z', updated_at, closed_at: null, draft: false, labels: [],
    pull_request: { merged_at: merged ? updated_at : null, html_url: '' },
    user: { login: 'Dreamstick9', avatar_url: '', html_url: '' },
  }) as never;

beforeEach(() => { for (const k of Object.keys(memoryKv)) delete memoryKv[k]; vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('writeProfileCache regression guard', () => {
  it('writes when there is no existing cache', async () => {
    expect(await writeProfileCache('Dreamstick9', user, [pr(1, '2026-10-06T15:18:00Z', true)], [])).toBe(true);
    expect((await readProfileCache('Dreamstick9'))?.prs).toHaveLength(1);
  });

  it('refuses a snapshot whose newest activity is older than the stored one', async () => {
    await writeProfileCache('Dreamstick9', user, [pr(17858, '2026-10-06T15:18:00Z', true), pr(141, '2026-09-30T19:49:00Z', true)], []);
    // a stale search response: #17858 still open, #141 missing
    const ok = await writeProfileCache('Dreamstick9', user, [pr(17858, '2026-10-06T11:36:00Z', false)], []);
    expect(ok).toBe(false);
    const stored = await readProfileCache('Dreamstick9');
    expect(stored?.prs).toHaveLength(2);
    expect(stored?.prs.find((p) => p.number === 17858)?.pull_request?.merged_at).not.toBeNull();
  });

  it('accepts a snapshot with newer activity even if it has fewer PRs', async () => {
    await writeProfileCache('Dreamstick9', user, [pr(1, '2026-10-01T00:00:00Z', false), pr(2, '2026-10-02T00:00:00Z', false)], []);
    expect(await writeProfileCache('Dreamstick9', user, [pr(1, '2026-10-03T00:00:00Z', true)], [])).toBe(true);
    expect((await readProfileCache('Dreamstick9'))?.prs).toHaveLength(1);
  });

  it('accepts equal-age data (a no-op refresh)', async () => {
    await writeProfileCache('Dreamstick9', user, [pr(1, '2026-10-01T00:00:00Z', false)], []);
    expect(await writeProfileCache('Dreamstick9', user, [pr(1, '2026-10-01T00:00:00Z', false)], [])).toBe(true);
  });

  it('refuses an empty list over a populated cache', async () => {
    await writeProfileCache('Dreamstick9', user, [pr(1, '2026-10-01T00:00:00Z', true)], []);
    expect(await writeProfileCache('Dreamstick9', user, [], [])).toBe(false);
  });
});
