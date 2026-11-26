import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./kv', () => {
  let mem: Record<string, unknown> = {};
  return {
    kvConfigured: () => false,
    kvPipeline: vi.fn(),
    kvGet: vi.fn(async (k: string) => mem[k] ?? null),
    kvSet: vi.fn(async (k: string, v: unknown) => { mem[k] = JSON.parse(JSON.stringify(v)); return true; }),
    __reset: () => { mem = {}; },
  };
});
const kv = await import('./kv');
const { usageDay, usageHour, usageDays, normalizePath, isBot, referrerHost, visitorKey, recordPageview, readUsage, recordFormEvent, readFormUsage, isFormEvent } = await import('./usage');

describe('usage: days are Indian days', () => {
  it('rolls over at 18:30 UTC', () => {
    expect(usageDay(new Date('2026-11-24T18:29:00Z'))).toBe('2026-11-24');
    expect(usageDay(new Date('2026-11-24T18:30:00Z'))).toBe('2026-11-25');
    expect(usageHour(new Date('2026-11-24T18:30:00Z'))).toBe('00');
    expect(usageHour(new Date('2026-11-24T08:10:00Z'))).toBe('13');
  });
  it('lists a range oldest first, across a month boundary', () => {
    expect(usageDays(3, new Date('2026-12-01T06:00:00Z'))).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
  });
});

describe('usage: what is counted', () => {
  it('maps paths to route patterns and drops the rest', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/contributors')).toBe('/contributors');
    expect(normalizePath('/contributors/octocat')).toBe('/contributors/[username]');
    expect(normalizePath('/Check-Work/someone?x=1')).toBe('/check-work/[username]');
    expect(normalizePath('/organizations')).toBe('/organizations');
    expect(normalizePath('/admin/dashboard')).toBeNull();
    expect(normalizePath('/programs/extra/deep')).toBeNull();
    expect(normalizePath('/wp-login.php')).toBeNull();
    expect(normalizePath(42)).toBeNull();
  });
  it('recognises bots and keeps only outside referrers', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot('Mozilla/5.0 (Macintosh) Safari/605.1.15')).toBe(false);
    expect(referrerHost('https://www.github.com/nst-sdc', 'os.nstsdc.org')).toBe('github.com');
    expect(referrerHost('https://os.nstsdc.org/programs', 'os.nstsdc.org')).toBeNull();
    expect(referrerHost('javascript:alert(1)', 'os.nstsdc.org')).toBeNull();
    expect(referrerHost('', 'os.nstsdc.org')).toBeNull();
  });
  it('prefers the browser id and falls back to address + browser', () => {
    expect(visitorKey('0b9f2a5e-1c3d-4e5f-8a7b-123456789abc', '1.1.1.1', 'ua')).toBe('0b9f2a5e-1c3d-4e5f-8a7b-123456789abc');
    const a = visitorKey('<script>', '1.1.1.1', 'ua');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorKey(null, '1.1.1.1', 'ua')).toBe(a);
    expect(visitorKey(null, '1.1.1.2', 'ua')).not.toBe(a);
  });
});

describe('usage: record and report', () => {
  beforeEach(() => { (kv as unknown as { __reset: () => void }).__reset(); });

  it('counts distinct visitors and users per day and across the range', async () => {
    const mon = new Date('2026-11-23T08:00:00Z'); // 13:30 IST
    const tue = new Date('2026-11-24T04:00:00Z'); // 09:30 IST
    await recordPageview({ path: '/', visitor: 'a', firstVisit: true, referrer: 'github.com', now: mon });
    await recordPageview({ path: '/programs', visitor: 'a', now: mon });
    await recordPageview({ path: '/', visitor: 'b', userId: 7, firstVisit: true, now: mon });
    await recordPageview({ path: '/', visitor: 'a', now: tue });
    await recordPageview({ path: '/contributors/[username]', visitor: 'c', userId: 7, now: tue });
    await recordPageview({ path: '/', visitor: 'd', userId: 9, now: tue });

    const r = (await readUsage(7, tue))!;
    expect(r.days).toHaveLength(7);
    expect(r.days.at(-2)).toEqual({ day: '2026-11-23', visitors: 2, users: 1, views: 3, newVisitors: 2 });
    expect(r.days.at(-1)).toEqual({ day: '2026-11-24', visitors: 3, users: 2, views: 3, newVisitors: 0 });
    expect(r.days[0]).toEqual({ day: '2026-11-18', visitors: 0, users: 0, views: 0, newVisitors: 0 });
    expect(r.rangeVisitors).toBe(4); // a, b, c, d: not 2 + 3
    expect(r.rangeUsers).toBe(2);
    expect(r.weekVisitors).toBe(4);
    expect(r.totalViews).toBe(6);
    expect(r.pages[0]).toEqual({ path: '/', views: 4 });
    expect(r.referrers).toEqual([{ host: 'github.com', views: 1 }]);
    expect(r.hours[13]).toBe(3);
    expect(r.hours[9]).toBe(3);
  });

  it('reports an empty range as zeros, not an error', async () => {
    const r = (await readUsage(30, new Date('2026-11-24T04:00:00Z')))!;
    expect(r.days).toHaveLength(30);
    expect(r.totalViews).toBe(0);
    expect(r.pages).toEqual([]);
  });
});

describe('form funnel', () => {
  it('counts events per day and form, distinct openers across the range, and ignores unknown events', async () => {
    const mon = new Date('2026-11-30T08:00:00Z');
    const tue = new Date('2026-12-01T08:00:00Z');
    await recordFormEvent('interest', 'open', 'a', mon);
    await recordFormEvent('interest', 'open', 'a', mon);
    await recordFormEvent('interest', 'open', 'b', mon);
    await recordFormEvent('interest', 'signin', 'a', mon);
    await recordFormEvent('interest', 'form', 'a', mon);
    await recordFormEvent('interest', 'registered', null, mon);
    await recordFormEvent('interest', 'open', 'a', tue);
    await recordFormEvent('interest', 'done', 'a', tue);
    await recordFormEvent('hack-day', 'open', 'z', tue);
    const r = (await readFormUsage('interest', 7, tue))!;
    expect(r.days.at(-2)).toEqual({ day: '2026-11-30', open: 3, form: 1, registered: 1 });
    expect(r.days.at(-1)).toEqual({ day: '2026-12-01', open: 1, form: 0, registered: 0 });
    expect(r.openers).toBe(2);
    expect(r.totals).toMatchObject({ open: 4, signin: 1, form: 1, done: 1, registered: 1, updated: 0 });
    const h = (await readFormUsage('hack-day', 7, tue))!;
    expect(h.totals.open).toBe(1);
    expect(h.openers).toBe(1);
    expect(isFormEvent('go:join')).toBe(true);
    expect(isFormEvent('go:evil')).toBe(false);
    expect(normalizePath('/interest')).toBe('/interest');
    expect(normalizePath('/forms/hack-day')).toBe('/forms/hack-day');
    expect(normalizePath('/forms/Hack Day')).toBe(null);
  });
});
