import { describe, it, expect, vi } from 'vitest';
import { archivedProjects, getGsocProjects, normalizeOfficial, officialProjectUrl } from './gsoc-projects';
import { gsocOfficialOrgUrl } from './org-explorer-types';

describe('gsoc projects from the official site', () => {
  it('links the archive for past years and the programme pages for the current one', () => {
    expect(officialProjectUrl(2024, 'lccFY8AH')).toBe('https://summerofcode.withgoogle.com/archive/2024/projects/lccFY8AH');
    expect(officialProjectUrl(2026, 'Yf2eiaqE')).toBe('https://summerofcode.withgoogle.com/programs/2026/projects/Yf2eiaqE');
    expect(gsocOfficialOrgUrl('sugar-labs', 2021)).toBe('https://summerofcode.withgoogle.com/archive/2021/organizations/sugar-labs');
  });

  it('normalises the official answer', () => {
    const p = normalizeOfficial({ slug: 'x', projects: [{ id: 'a1', title: 'T', project_code_url: 'https://c', contributor_display_name: 'Ann', mentor_names: ['M'], abstract_short: 'S', tech_tags: ['python'] }] }, 2024);
    expect(p).toEqual([{ title: 'T', url: 'https://summerofcode.withgoogle.com/archive/2024/projects/a1', contributor: 'Ann', mentors: ['M'], summary: 'S', codeUrl: 'https://c', tech: ['python'] }]);
  });

  it('serves 2016–2021 from the archive file with official links', () => {
    const list = archivedProjects('sugar-labs', 2016)!;
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].url).toMatch(/^https:\/\/summerofcode\.withgoogle\.com\/archive\/2016\/projects\//);
    expect(archivedProjects('no-such-org', 2016)).toBeNull();
  });

  it('fetches 2022+ from the official API and rejects bad input', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slug: 'sympy', projects: [{ id: 'p1', title: 'Solve' }] }), { status: 200 }));
    const r = await getGsocProjects('sympy', 2025, { fetch: f as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true, source: 'official' });
    if (r.ok) expect(r.projects[0]).toEqual({ title: 'Solve', url: 'https://summerofcode.withgoogle.com/archive/2025/projects/p1' });
    expect(f.mock.calls[0][0]).toBe('https://summerofcode.withgoogle.com/api/archive/programs/2025/organizations/sympy/');
    expect(await getGsocProjects('../x', 2025)).toMatchObject({ ok: false, reason: 'bad-year' });
    expect(await getGsocProjects('sympy', 2010)).toMatchObject({ ok: false, reason: 'bad-year' });
  });
});
