import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./kv', () => {
  let mem: Record<string, unknown> = {};
  return {
    kvRead: vi.fn(async (k: string) => ({ ok: true, value: mem[k] ?? null })),
    kvGet: vi.fn(async (k: string) => mem[k] ?? null),
    kvSet: vi.fn(async (k: string, v: unknown) => { mem[k] = v; return true; }),
    __reset: () => { mem = {}; },
  };
});
const kv = await import('./kv');
const { addVouchedOrg, removeVouchedOrg, getVouchedOrgs, primeVouchedOrgs, _resetVouchedMemory } = await import('./kv-vouched-orgs');
const { isProgramOrg, isVouchedOrg } = await import('./program-orgs');

describe('vouched organisations', () => {
  beforeEach(() => { (kv as unknown as { __reset: () => void }).__reset(); _resetVouchedMemory(); });

  it('adds, normalises and dedupes logins, and the scorer sees them once primed', async () => {
    expect(isProgramOrg('uyuni-project')).toBe(false);
    expect((await addVouchedOrg('https://github.com/uyuni-project/', 'SUSE Uyuni')).ok).toBe(true);
    expect((await addVouchedOrg('@Uyuni-Project')).ok).toBe(false);
    expect((await addVouchedOrg('not a login!')).ok).toBe(false);
    expect((await getVouchedOrgs()).map((v) => v.login)).toEqual(['uyuni-project']);
    expect(isProgramOrg('UYUNI-PROJECT')).toBe(true);
    expect(isVouchedOrg('uyuni-project')).toBe(true);
    expect(isProgramOrg('jenkinsci')).toBe(true); // still on the program list
  });

  it('removes and un-primes', async () => {
    await addVouchedOrg('sugarlabs');
    expect(isProgramOrg('sugarlabs')).toBe(true);
    expect((await removeVouchedOrg('SugarLabs')).ok).toBe(true);
    expect((await removeVouchedOrg('sugarlabs')).ok).toBe(false);
    expect(isVouchedOrg('sugarlabs')).toBe(false);
  });

  it('never loosens the gate on a failed read', async () => {
    await addVouchedOrg('owasp');
    const kvRead = kv.kvRead as unknown as ReturnType<typeof vi.fn>;
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    expect((await addVouchedOrg('another')).ok).toBe(false);
    _resetVouchedMemory();
    kvRead.mockResolvedValueOnce({ ok: false, value: null });
    await primeVouchedOrgs(true);
    expect(isVouchedOrg('owasp')).toBe(false);
  });
});
