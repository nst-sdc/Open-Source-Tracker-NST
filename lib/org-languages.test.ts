import { describe, it, expect, vi } from 'vitest';
import { aggregateLanguageBytes, combinedShare, shareOf } from './org-languages-shared';
import { dueOrgLanguages, measureOrgLanguages, toLanguageMap } from './org-languages';

describe('organisation languages', () => {
  it('aggregates bytes across repositories into shares, most bytes first', () => {
    const p = aggregateLanguageBytes([
      { languages: [{ name: 'Python', size: 700 }, { name: 'Shell', size: 100 }] },
      { languages: [{ name: 'Python', size: 100 }, { name: 'C++', size: 100 }] },
    ], 42);
    expect(p.repos).toBe(2);
    expect(p.totalRepos).toBe(42);
    expect(p.languages).toEqual([['Python', 80, 2], ['Shell', 10, 1], ['C++', 10, 1]]);
    expect(shareOf(p, 'python')).toBe(80);
    expect(shareOf(p, 'Rust')).toBe(0);
    expect(combinedShare(p, ['Python', 'C++'])).toBe(90);
  });

  it('ignores a language below the noise floor', () => {
    const p = aggregateLanguageBytes([{ languages: [{ name: 'Python', size: 9950 }, { name: 'Makefile', size: 50 }] }], 1);
    expect(shareOf(p, 'Makefile')).toBe(0);
  });

  it('lists due organisations, ours first, skipping fresh ones', () => {
    const now = Date.parse('2026-11-24T00:00:00Z');
    const due = dueOrgLanguages({
      candidates: [{ login: 'apache', contributors: 35 }, { login: 'zulip', contributors: 7 }, { login: 'KDE', contributors: 0 }, { login: 'Apache', contributors: 1 }, { login: 'fresh', contributors: 0 }],
      store: {
        fresh: { login: 'fresh', measuredAt: '2026-11-20T00:00:00Z', repos: 1, totalRepos: 1, languages: [] },
        zulip: { login: 'zulip', measuredAt: '2026-09-01T00:00:00Z', repos: 1, totalRepos: 1, languages: [] },
      },
      nowMs: now,
    });
    expect(due).toEqual(['apache', 'zulip', 'KDE']);
  });

  it('measures one organisation through GraphQL and tells a missing one from a rate limit', async () => {
    const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
    const f = vi.fn()
      .mockImplementationOnce(() => answer(200, { data: { organization: { repositories: { totalCount: 3, nodes: [
        { name: 'a', languages: { totalSize: 300, edges: [{ size: 200, node: { name: 'Rust' } }, { size: 100, node: { name: 'C' } }] } },
        { name: 'b', languages: { totalSize: 100, edges: [{ size: 100, node: { name: 'Rust' } }] } },
      ] } } } }))
      .mockImplementationOnce(() => answer(200, { data: { organization: null }, errors: [{ type: 'NOT_FOUND', message: "Could not resolve to an Organization with the login of 'nope'." }] }))
      .mockImplementationOnce(() => answer(403, { message: 'rate limited' }));
    const now = () => new Date('2026-11-24T00:00:00Z');
    const ok = await measureOrgLanguages('rust-lang', {}, { fetch: f as unknown as typeof fetch, now });
    expect(ok.kind).toBe('ok');
    if (ok.kind === 'ok') {
      expect(ok.record.languages).toEqual([['Rust', 75, 2], ['C', 25, 1]]);
      expect(ok.record.totalRepos).toBe(3);
      expect(toLanguageMap({ 'rust-lang': ok.record })['rust-lang'].repos).toBe(2);
    }
    expect((await measureOrgLanguages('nope', {}, { fetch: f as unknown as typeof fetch, now })).kind).toBe('missing');
    expect((await measureOrgLanguages('x', {}, { fetch: f as unknown as typeof fetch, now })).kind).toBe('rate-limited');
    const sent = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.variables).toEqual({ login: 'rust-lang', repos: 50, langs: 10 });
  });
});
