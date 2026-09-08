/**
 * Web search / fetch tests.
 *
 * Two properties carry the weight here:
 *  - Output is hard-capped. Tool results are re-sent on every remaining loop
 *    iteration, and the provider tier allows 200,000 tokens per DAY for the
 *    whole deployment, so an uncapped page would be a real outage.
 *  - `full_content` is never enabled. It returns whole articles.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readUrls, webSearch } from './websearch';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env.WEB_SEARCH_DISABLED;
});

function sse(payload: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function searchPayload(results: unknown[]) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: { content: [], structuredContent: { search_id: 's1', session_id: 'x', results } },
  };
}

const RESULT = {
  url: 'https://docs.github.com/pull-requests',
  title: 'Creating a pull request',
  publish_date: '2025-01-02',
  excerpts: ['Fork the repository, then open a pull request.'],
};

describe('webSearch', () => {
  it('renders results with their sources', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(sse(searchPayload([RESULT])));
    const r = await webSearch('how to open a PR', ['github pull request'], 'sess');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('Creating a pull request');
      // The URL must survive: an answer a student cannot verify is worth little.
      expect(r.text).toContain('https://docs.github.com/pull-requests');
      expect(r.text).toContain('2025-01-02');
    }
  });

  it('requires an objective and at least one query, before any network call', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy;
    expect((await webSearch('   ', ['q'], 's')).ok).toBe(false);
    expect((await webSearch('find', [], 's')).ok).toBe(false);
    expect((await webSearch('find', [42], 's')).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('forwards the session id and caps queries at three', async () => {
    const spy = vi.fn().mockResolvedValue(sse(searchPayload([RESULT])));
    globalThis.fetch = spy;
    await webSearch('obj', ['a', 'b', 'c', 'd', 'e'], 'chat-123');
    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(body.params.arguments.session_id).toBe('chat-123');
    expect(body.params.arguments.search_queries).toHaveLength(3);
  });

  it('caps total output so one search cannot eat the token budget', async () => {
    const fat = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: 'T'.repeat(200),
      excerpts: ['E'.repeat(5000)],
    }));
    globalThis.fetch = vi.fn().mockResolvedValue(sse(searchPayload(fat)));
    const r = await webSearch('obj', ['q'], 's');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.length).toBeLessThanOrEqual(1600);
  });

  it('never sends credentials or follows a redirect elsewhere', async () => {
    const spy = vi.fn().mockResolvedValue(sse(searchPayload([RESULT])));
    globalThis.fetch = spy;
    await webSearch('obj', ['q'], 's');
    const init = spy.mock.calls[0][1] as RequestInit;
    const keys = Object.keys(init.headers as Record<string, string>).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(keys).not.toContain('cookie');
    expect(init.redirect).toBe('error');
  });

  it('reports an empty result set as a failure, not an empty answer', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(sse(searchPayload([])));
    expect((await webSearch('obj', ['q'], 's')).ok).toBe(false);
  });

  it('survives a transport failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('boom'));
    expect((await webSearch('obj', ['q'], 's')).ok).toBe(false);
  });

  it('can be switched off', async () => {
    process.env.WEB_SEARCH_DISABLED = '1';
    const spy = vi.fn();
    globalThis.fetch = spy;
    expect((await webSearch('obj', ['q'], 's')).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('readUrls', () => {
  it('reads a page and keeps its source', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(sse(searchPayload([RESULT])));
    const r = await readUrls(['https://docs.github.com/pull-requests'], 'how to open a PR', 's');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('https://docs.github.com/pull-requests');
  });

  it('never requests full page content', async () => {
    // full_content returns whole articles — tens of thousands of tokens.
    const spy = vi.fn().mockResolvedValue(sse(searchPayload([RESULT])));
    globalThis.fetch = spy;
    await readUrls(['https://example.com/a'], 'obj', 's');
    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(body.params.arguments.full_content).toBe(false);
  });

  it('rejects non-http schemes without calling out', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy;
    for (const bad of ['file:///etc/passwd', 'data:text/html,x', 'javascript:alert(1)', 'not a url']) {
      expect((await readUrls([bad], 'obj', 's')).ok).toBe(false);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('caps the number of URLs', async () => {
    const spy = vi.fn().mockResolvedValue(sse(searchPayload([RESULT])));
    globalThis.fetch = spy;
    await readUrls(
      ['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com', 'https://e.com'],
      'obj',
      's',
    );
    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(body.params.arguments.urls).toHaveLength(3);
  });

  it('accepts a bare string as well as an array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(sse(searchPayload([RESULT])));
    expect((await readUrls('https://docs.github.com/pull-requests', 'obj', 's')).ok).toBe(true);
  });

  it('caps page output', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sse(searchPayload([{ url: 'https://a.com', title: 'T', excerpts: ['X'.repeat(60_000)] }])),
    );
    const r = await readUrls(['https://a.com'], 'obj', 's');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.length).toBeLessThanOrEqual(1800);
  });

  it('reports a page with no readable text as a failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sse(searchPayload([{ url: 'https://a.com', title: 'T', excerpts: [] }])),
    );
    expect((await readUrls(['https://a.com'], 'obj', 's')).ok).toBe(false);
  });
});
