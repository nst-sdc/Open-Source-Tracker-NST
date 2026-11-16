import { describe, it, expect } from 'vitest';
import { verifyLinks, isPublicAddress, isBlockedHostname, type Fetcher } from './socials-verify';

const res = (status: number, body = '') => new Response(body, { status });
const fakeFetch =
  (table: Record<string, Response | Error>): Fetcher =>
  async (url) => {
    const hit = Object.entries(table).find(([k]) => url.startsWith(k));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    if (hit[1] instanceof Error) throw hit[1];
    return hit[1].clone();
  };
const deps = (table: Record<string, Response | Error>, mx: Record<string, unknown[] | Error> = {}) => ({
  fetch: fakeFetch(table),
  resolveMx: async (d: string) => {
    const v = mx[d];
    if (v instanceof Error) throw v;
    return v ?? [];
  },
  lookup: async (h: string) => (h === 'private.example' ? [{ address: '10.0.0.5' }] : [{ address: '93.184.216.34' }]),
  now: () => new Date('2026-11-16T10:00:00.000Z'),
});

describe('verifyLinks', () => {
  it('confirms accounts the platforms say exist and stamps them', async () => {
    const r = await verifyLinks(
      {
        x: 'https://x.com/github',
        youtube: 'https://www.youtube.com/@GitHub',
        telegram: 'https://t.me/durov',
        linkedin: 'https://www.linkedin.com/in/satyanadella',
        email: 'someone@gmail.com',
        website: 'https://example.com',
      },
      deps(
        {
          'https://publish.x.com/oembed': res(200, '{}'),
          'https://www.youtube.com/@GitHub': res(200),
          'https://t.me/durov': res(200, '<div class="tgme_page_title">Pavel</div>'),
          'https://www.linkedin.com/in/satyanadella': res(200),
          'https://example.com': res(301),
        },
        { 'gmail.com': [{ exchange: 'mx.google.com' }] },
      ),
    );
    expect(r.errors).toEqual({});
    expect(Object.keys(r.verifiedAt).sort()).toEqual(['email', 'linkedin', 'telegram', 'website', 'x', 'youtube']);
    expect(r.verifiedAt.x).toBe('2026-11-16T10:00:00.000Z');
  });

  it('rejects accounts the platforms say do not exist, naming each field', async () => {
    const r = await verifyLinks(
      {
        x: 'https://x.com/nobody',
        youtube: 'https://www.youtube.com/@nobody',
        telegram: 'https://t.me/nobody',
        email: 'a@no-such-domain.test',
        website: 'https://example.com/missing',
      },
      deps(
        {
          'https://publish.x.com/oembed': res(404),
          'https://www.youtube.com/@nobody': res(404),
          'https://t.me/nobody': res(200, '<title>Telegram: Contact @nobody</title>'),
          'https://example.com/missing': res(404),
        },
        { 'no-such-domain.test': Object.assign(new Error('x'), { code: 'ENOTFOUND' }) },
      ),
    );
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'telegram', 'website', 'x', 'youtube']);
    expect(r.errors.x).toMatch(/No X account/);
    expect(r.verifiedAt).toEqual({});
  });

  it("treats LinkedIn's bot wall as unknown, not as missing", async () => {
    const r = await verifyLinks({ linkedin: 'https://www.linkedin.com/in/someone' }, deps({ 'https://www.linkedin.com/in/someone': { status: 999, clone() { return this; }, text: async () => '' } as unknown as Response }));
    expect(r.errors).toEqual({});
    expect(r.verifiedAt).toEqual({});
  });

  it('reports an unreachable platform as a retryable error rather than a pass', async () => {
    const r = await verifyLinks({ x: 'https://x.com/github' }, deps({ 'https://publish.x.com/oembed': new Error('timeout') }));
    expect(r.errors.x).toMatch(/Could not reach X/);
  });

  it('refuses websites that point at private or internal addresses', async () => {
    const r = await verifyLinks(
      { website: 'https://private.example' },
      deps({ 'https://private.example': res(200) }),
    );
    expect(r.errors.website).toMatch(/public website/);
    const r2 = await verifyLinks({ website: 'https://kv-rest.opensource-tracker.svc.cluster.local' }, deps({}));
    expect(r2.errors.website).toMatch(/public website/);
  });

  it('leaves Instagram and Discord to the format check', async () => {
    const r = await verifyLinks({ instagram: 'https://www.instagram.com/x', discord: 'x.y' }, deps({}));
    expect(r).toEqual({ errors: {}, verifiedAt: {} });
  });
});

describe('address guards', () => {
  it('knows public from private', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700::1111']) expect(isPublicAddress(ip)).toBe(true);
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', 'not-an-ip'])
      expect(isPublicAddress(ip)).toBe(false);
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('valkey')).toBe(true);
    expect(isBlockedHostname('my-site.dev')).toBe(false);
  });
});
