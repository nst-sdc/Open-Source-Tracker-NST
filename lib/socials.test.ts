import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => true) }));
const { normalizeSocials, socialLinks, hasAnySocial } = await import('./socials');

describe('normalizeSocials', () => {
  it('accepts handles and URLs alike and stores canonical URLs', () => {
    const r = normalizeSocials({
      tagline: '  Looking for  a GSoC mentor in Rust ',
      links: {
        linkedin: 'https://www.linkedin.com/in/sai-udayagiri/',
        x: '@sai_dev',
        telegram: 't.me/saidev',
        instagram: 'https://instagram.com/sai.dev/',
        youtube: 'youtube.com/@saidev',
        discord: 'sai.dev',
        email: 'Sai@Example.com',
        website: 'sai.dev/about#top',
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tagline).toBe('Looking for a GSoC mentor in Rust');
    expect(r.value.links).toEqual({
      linkedin: 'https://www.linkedin.com/in/sai-udayagiri',
      x: 'https://x.com/sai_dev',
      telegram: 'https://t.me/saidev',
      instagram: 'https://www.instagram.com/sai.dev',
      youtube: 'https://www.youtube.com/@saidev',
      discord: 'sai.dev',
      email: 'sai@example.com',
      website: 'https://sai.dev/about',
    });
  });

  it('rejects links on the wrong host, javascript URLs and junk, per field', () => {
    const r = normalizeSocials({
      links: {
        linkedin: 'https://evil.example/in/someone',
        x: 'https://x.com/',
        website: 'javascript:alert(1)',
        email: 'not an email',
        discord: 'Has Spaces',
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['discord', 'email', 'linkedin', 'website', 'x']);
  });

  it('treats empty strings as clearing a field and ignores unknown fields', () => {
    const r = normalizeSocials({ tagline: '', links: { x: '', linkedin: '  ', tiktok: 'nope', website: 'https://a.b' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tagline).toBeUndefined();
    expect(r.value.links).toEqual({ website: 'https://a.b' });
  });

  it('caps the tagline', () => {
    const r = normalizeSocials({ tagline: 'x'.repeat(141), links: {} });
    expect(r.ok).toBe(false);
  });
});

describe('socialLinks', () => {
  it('renders handles, a mailto, and no href for Discord', () => {
    const links = socialLinks({
      links: { x: 'https://x.com/sai_dev', email: 'sai@example.com', discord: 'sai.dev', website: 'https://www.sai.dev/about' },
      updatedAt: '2026-11-16T00:00:00.000Z',
    });
    expect(links.map((l) => [l.platform, l.display, l.href])).toEqual([
      ['x', '@sai_dev', 'https://x.com/sai_dev'],
      ['website', 'sai.dev/about', 'https://www.sai.dev/about'],
      ['email', 'sai@example.com', 'mailto:sai@example.com'],
      ['discord', 'sai.dev', null],
    ]);
    expect(hasAnySocial(null)).toBe(false);
    expect(hasAnySocial({ links: {}, tagline: 'hi', updatedAt: '' })).toBe(true);
  });
});
