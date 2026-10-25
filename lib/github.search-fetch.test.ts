import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => {}) }));
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

  it('fails the whole fetch when a later page fails, instead of returning a truncated list', async () => {
    const page1 = { total_count: 150, incomplete_results: false, items: Array.from({ length: 100 }, (_, i) => item(i + 1)) };
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('page=2') ? json({ message: 'boom' }, 500) : json(page1),
    );
    expect(await getStudentPRs('someone', 'tok')).toBeNull();
  });
});
