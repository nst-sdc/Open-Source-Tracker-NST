import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getStudentProfile } = vi.hoisted(() => ({ getStudentProfile: vi.fn() }));
const { addAchiever } = vi.hoisted(() => ({ addAchiever: vi.fn() }));
const { getStudentsKV } = vi.hoisted(() => ({ getStudentsKV: vi.fn() }));
const { checkAdminAuth } = vi.hoisted(() => ({ checkAdminAuth: vi.fn() }));

vi.mock('@/lib/admin-auth', () => ({ checkAdminAuth }));
vi.mock('@/lib/github', () => ({ getStudentProfile }));
vi.mock('@/lib/kv-students', () => ({ getStudentsKV }));
vi.mock('@/lib/kv-achievers', () => ({
  addAchiever,
  getAchieversKV: vi.fn(async () => []),
  updateAchiever: vi.fn(),
  deleteAchiever: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST } = await import('./route');

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/admin/achievers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));

const LFX = { github: 'Jitmisra', programs: [{ name: 'LFX', year: 2026, org: 'Meshery' }] };

beforeEach(() => {
  vi.clearAllMocks();
  checkAdminAuth.mockResolvedValue(true);
  getStudentsKV.mockResolvedValue([{ github: 'Jitmisra', year: '3rd year', campus: 'Rishihood' }]);
  getStudentProfile.mockResolvedValue({ login: 'Jitmisra' });
  addAchiever.mockResolvedValue({ ok: true, merged: true });
});

describe('POST /api/admin/achievers', () => {
  it('merges a second program into an existing achiever', async () => {
    const res = await post(LFX);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, merged: true });
  });

  it('still adds when GitHub verification is rate limited, rather than 500ing', async () => {
    getStudentProfile.mockRejectedValue(new Error('GitHub rate limit exceeded'));
    const res = await post(LFX);
    expect(res.status).toBe(200);
    expect(addAchiever).toHaveBeenCalledOnce();
  });

  it('still adds when GitHub is down', async () => {
    getStudentProfile.mockRejectedValue(new Error('GitHub API returned status 503'));
    expect((await post(LFX)).status).toBe(200);
  });

  it('checks the roster before spending a GitHub call', async () => {
    getStudentsKV.mockResolvedValue([]);
    const res = await post(LFX);
    expect(res.status).toBe(409);
    expect(getStudentProfile).not.toHaveBeenCalled();
  });

  it('rejects a username GitHub definitively does not have', async () => {
    getStudentProfile.mockResolvedValue(null);
    expect((await post(LFX)).status).toBe(404);
    expect(addAchiever).not.toHaveBeenCalled();
  });

  it('reports a genuine duplicate as 409, not success', async () => {
    addAchiever.mockResolvedValue({ ok: false, message: 'Jitmisra already has that program recorded.' });
    const res = await post(LFX);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('already has');
  });

  it('requires auth', async () => {
    checkAdminAuth.mockResolvedValue(false);
    expect((await post(LFX)).status).toBe(401);
    expect(addAchiever).not.toHaveBeenCalled();
  });
});
