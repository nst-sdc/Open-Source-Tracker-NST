import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvRead: vi.fn(async () => ({ ok: true, value: null })), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => {}) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const { getStudentPRs } = await import('./github');

const item = (number: number) => ({
  id: number, number, title: `pr ${number}`, state: 'open', html_url: `https://github.com/o/r/pull/${number}`,
  repository_url: 'https://api.github.com/repos/o/r', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  closed_at: null, draft: false, labels: [], pull_request: { merged_at: null, html_url: '' },
  user: { login: 'x', avatar_url: '', html_url: '' },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });

describe('GitHub search fetches', () => {
  it('bypass the Next data cache: no-store, no revalidate', async () => {
    fetchMock.mockResolvedValue(json({ total_count: 1, incomplete_results: false, items: [item(1)] }));
    await getStudentPRs('someone', 'tok');
    const searchCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/search/issues'));
    expect(searchCalls.length).toBeGreaterThan(0);
    for (const [, init] of searchCalls) {
      expect((init as RequestInit).cache).toBe('no-store');
      expect((init as { next?: unknown }).next).toBeUndefined();
    }
  });

  it('treats incomplete_results as a failed fetch rather than a short list', async () => {
    fetchMock.mockResolvedValue(json({ total_count: 300, incomplete_results: true, items: [item(1), item(2)] }));
    expect(await getStudentPRs('someone', 'tok')).toBeNull();
  });

  it('chains a second query when the first hits the 1,000-result cap, deduping the boundary PR', async () => {
    const at = (n: number) => new Date(Date.UTC(2020, 0, 1) + n * 3_600_000).toISOString().replace('.000Z', 'Z'); // monotonic in n
    const pr = (n: number) => ({ ...item(n), created_at: at(n) });
    // 1,100 PRs on GitHub; a plain query is capped at 1,000 (ten pages)
    const newest = Array.from({ length: 1000 }, (_, i) => pr(2000 - i));
    const older = Array.from({ length: 101 }, (_, i) => pr(1001 - i)); // 1001 is the boundary PR, repeated
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(String(url));
      const page = Number(u.searchParams.get('page') ?? '1');
      const q = u.searchParams.get('q') ?? '';
      if (q.includes('created:<=')) {
        expect(q).toContain(`created:<=${at(1001)}`);
        return json({ total_count: older.length, incomplete_results: false, items: older.slice((page - 1) * 100, page * 100) });
      }
      return json({ total_count: 1100, incomplete_results: false, items: newest.slice((page - 1) * 100, page * 100) });
    });
    const prs = await getStudentPRs('prolific', 'tok');
    expect(prs).not.toBeNull();
    expect(prs!.length).toBe(1100);
    expect(new Set(prs!.map((p) => p.id)).size).toBe(1100);
    const searchCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/search/issues'));
    expect(searchCalls.length).toBe(12); // 10 capped pages + 2 for the older window
  });

  it('does not chain when the first query returns everything', async () => {
    fetchMock.mockResolvedValue(json({ total_count: 1, incomplete_results: false, items: [item(1)] }));
    await getStudentPRs('someone', 'tok');
    const qs = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('q') ?? '');
    expect(qs.some((q) => q.includes('created:'))).toBe(false);
  });

  it('fails the whole fetch when a later page fails, instead of returning a truncated list', async () => {
    const page1 = { total_count: 150, incomplete_results: false, items: Array.from({ length: 100 }, (_, i) => item(i + 1)) };
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('page=2') ? json({ message: 'boom' }, 500) : json(page1),
    );
    expect(await getStudentPRs('someone', 'tok')).toBeNull();
  });
});
