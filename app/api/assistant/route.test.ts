/**
 * Route-level auth tests for POST /api/assistant.
 *
 * The same forged cookie that broke /api/agent also made the chat assistant
 * personalize as the victim — it replied "You are signed in as
 * @sarthak-gupta229 and you are tracked on the leaderboard." Requirement:
 * neither route answers anyone who is not signed in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cookieJar = new Map<string, string>();
const kvStore = new Map<string, unknown>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

vi.mock('@/lib/kv', () => ({
  kvGet: async (key: string) => (kvStore.has(key) ? kvStore.get(key) : null),
  kvSet: async (key: string, value: unknown) => {
    kvStore.set(key, value);
    return true;
  },
  kvDel: async (key: string) => {
    kvStore.delete(key);
    return true;
  },
}));

vi.mock('@/lib/audit-log', () => ({ logEvent: async () => {} }));
vi.mock('@/lib/kv-students', () => ({ getStudentsKV: async () => [] }));

import { POST } from './route';

let uniqueId = 700000;
const githubUser = () => ({
  id: ++uniqueId,
  login: `student${uniqueId}`,
  name: 'A Student',
  avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
});

let providerCalls: string[];
let githubCalls: string[];
let githubResponse: () => Response;

function chatRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://oss-tracker.nstsdc.org/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'how do I start?' }] }),
  });
}

function sseResponse(): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

beforeEach(() => {
  cookieJar.clear();
  kvStore.clear();
  providerCalls = [];
  githubCalls = [];
  githubResponse = () => new Response(JSON.stringify(githubUser()), { status: 200 });

  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('api.github.com')) {
      githubCalls.push(url);
      return githubResponse();
    }
    providerCalls.push(url);
    return sseResponse();
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/assistant — authentication is required', () => {
  it('refuses an anonymous caller and spends nothing', async () => {
    const res = await POST(chatRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('auth_required');
    expect(providerCalls).toHaveLength(0);
  });

  it('refuses the forged cookie that used to personalize as the victim', async () => {
    cookieJar.set('github_oauth_token', 'totally_fake_not_a_real_token');
    cookieJar.set('github_username', 'sarthak-gupta229');
    githubResponse = () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });

    const res = await POST(chatRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('auth_expired');
    expect(JSON.stringify(body)).not.toContain('sarthak-gupta229');
    expect(providerCalls).toHaveLength(0);
  });

  it('rejects a cross-site request', async () => {
    cookieJar.set('github_oauth_token', 'gho_hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh');
    const res = await POST(chatRequest({ 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('bad_origin');
    expect(providerCalls).toHaveLength(0);
  });

  it('answers 503 when GitHub is unreachable, so nobody is wrongly accused', async () => {
    cookieJar.set('github_oauth_token', 'gho_iiiiiiiiiiiiiiiiiiiiiiiiiiiiii');
    githubResponse = () => new Response('{}', { status: 500 });

    const res = await POST(chatRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('auth_unavailable');
    expect(providerCalls).toHaveLength(0);
  });

  it('streams for a signed-in student', async () => {
    cookieJar.set('github_oauth_token', 'gho_jjjjjjjjjjjjjjjjjjjjjjjjjjjjjj');
    const res = await POST(chatRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(providerCalls).toHaveLength(1);
  });

  it('keys rate limits on the numeric id', async () => {
    const user = githubUser();
    cookieJar.set('github_oauth_token', 'gho_kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk');
    githubResponse = () => new Response(JSON.stringify(user), { status: 200 });

    await POST(chatRequest());

    const rlKeys = [...kvStore.keys()].filter((k) => k.startsWith('rl:assistant:'));
    expect(rlKeys.length).toBeGreaterThan(0);
    for (const key of rlKeys) {
      expect(key).toContain(String(user.id));
      expect(key).not.toContain(user.login);
    }
  });

  it('fetches the caller’s profile with the caller’s own token', async () => {
    const token = 'gho_llllllllllllllllllllllllllllll';
    cookieJar.set('github_oauth_token', token);
    let profileAuth: string | null = null;

    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://api.github.com/user') {
        const auth = new Headers(init?.headers).get('Authorization');
        // The first call is the session check; the second builds the DATA
        // block. Both must present the caller's own token — never a pooled
        // one belonging to another student.
        expect(auth).toBe(`Bearer ${token}`);
        profileAuth = auth;
        return new Response(JSON.stringify(githubUser()), { status: 200 });
      }
      providerCalls.push(url);
      return sseResponse();
    });

    const res = await POST(chatRequest());
    expect(res.status).toBe(200);
    expect(profileAuth).toBe(`Bearer ${token}`);
  });
});
