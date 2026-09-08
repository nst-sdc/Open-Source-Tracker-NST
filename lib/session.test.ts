/**
 * Session tests. These are the regression suite for the impersonation bug:
 * a forged `github_username` cookie used to be believed outright.
 *
 * Hermetic — `next/headers` is mocked, `fetch` is stubbed, and the KV layer
 * falls back to disk with keys derived from per-test unique tokens, so no
 * two tests can collide and nothing touches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

import {
  getViewer,
  getViewerToken,
  invalidateViewerCache,
  viewerCacheKey,
  VIEWER_CACHE_TTL_SECONDS,
} from './session';
import { kvGet } from './kv';

/** A syntactically plausible token, unique per test so cache keys never collide. */
const freshToken = (label: string) =>
  `gho_${label.replace(/[^A-Za-z0-9]/g, '')}${Date.now()}${Math.floor(Math.random() * 1e9)}`;

const GITHUB_USER = {
  id: 583231,
  login: 'octocat',
  name: 'The Octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
};

let fetchMock: ReturnType<typeof vi.fn>;

function respondWith(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

beforeEach(() => {
  cookieJar.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getViewer — the impersonation regression', () => {
  it('IGNORES the github_username cookie and uses GitHub’s answer', async () => {
    // This is verbatim the shape of the working exploit: a junk token plus a
    // victim's name. Before lib/session.ts existed, the victim's name was
    // simply believed, and login-gated tools ran as them.
    const token = freshToken('forged');
    cookieJar.set('github_oauth_token', token);
    cookieJar.set('github_username', 'sarthak-gupta229');
    respondWith(200, GITHUB_USER);

    const result = await getViewer();

    expect(result.status).toBe('authenticated');
    if (result.status !== 'authenticated') return;
    expect(result.viewer.login).toBe('octocat');
    expect(result.viewer.login).not.toBe('sarthak-gupta229');
    expect(result.viewer.id).toBe(583231);
  });

  it('rejects the forged cookie outright once GitHub says 401', async () => {
    cookieJar.set('github_oauth_token', 'totally_fake_not_a_real_token');
    cookieJar.set('github_username', 'sarthak-gupta229');
    respondWith(401, { message: 'Bad credentials' });

    expect((await getViewer()).status).toBe('invalid');
  });

  it('never reports a viewer built from cookie data alone', async () => {
    cookieJar.set('github_username', 'sarthak-gupta229');
    // No token cookie at all.
    const result = await getViewer();
    expect(result.status).toBe('anonymous');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getViewer — states', () => {
  it('is anonymous with no cookie and makes no network call', async () => {
    const result = await getViewer();
    expect(result.status).toBe('anonymous');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an implausible token without asking GitHub', async () => {
    cookieJar.set('github_oauth_token', 'short');
    expect((await getViewer()).status).toBe('invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps 403 to unavailable, NOT invalid', async () => {
    // A secondary-rate-limit 403 must never be read as "your token is bad":
    // that would delete a valid student's cookie and evict their token from
    // the shared refresh pool.
    cookieJar.set('github_oauth_token', freshToken('forbidden'));
    respondWith(403, { message: 'API rate limit exceeded' });
    expect((await getViewer()).status).toBe('unavailable');
  });

  it('maps 500 to unavailable', async () => {
    cookieJar.set('github_oauth_token', freshToken('servererror'));
    respondWith(500, {});
    expect((await getViewer()).status).toBe('unavailable');
  });

  it('maps a network failure to unavailable', async () => {
    cookieJar.set('github_oauth_token', freshToken('netfail'));
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    expect((await getViewer()).status).toBe('unavailable');
  });

  it('treats an unrecognized body as unavailable rather than trusting it', async () => {
    cookieJar.set('github_oauth_token', freshToken('badbody'));
    respondWith(200, { login: 'octocat' }); // no numeric id
    expect((await getViewer()).status).toBe('unavailable');
  });
});

describe('getViewer — caching', () => {
  it('asks GitHub once, then serves from cache', async () => {
    const token = freshToken('cachehit');
    cookieJar.set('github_oauth_token', token);
    respondWith(200, GITHUB_USER);

    const first = await getViewer();
    const second = await getViewer();

    expect(first.status).toBe('authenticated');
    expect(second.status).toBe('authenticated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches a 401 so a rotating attacker cannot hammer GitHub', async () => {
    const token = freshToken('cachemiss');
    cookieJar.set('github_oauth_token', token);
    respondWith(401, { message: 'Bad credentials' });

    expect((await getViewer()).status).toBe('invalid');
    expect((await getViewer()).status).toBe('invalid');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stores no token material in the cache entry', async () => {
    const token = freshToken('nosecrets');
    cookieJar.set('github_oauth_token', token);
    respondWith(200, GITHUB_USER);
    await getViewer();

    const key = viewerCacheKey(token);
    expect(key).not.toContain(token);
    expect(key.startsWith('ghid:')).toBe(true);

    const raw = JSON.stringify(await kvGet(key));
    expect(raw).not.toContain(token);
    expect(raw).not.toMatch(/gho_|ghp_|github_pat_/);
    expect(raw).toContain('octocat');
  });

  it('does not cache an unavailable verdict', async () => {
    const token = freshToken('nocacheunavail');
    cookieJar.set('github_oauth_token', token);
    respondWith(500, {});
    await getViewer();
    // A GitHub outage must not pin the student into a bad state.
    respondWith(200, GITHUB_USER);
    expect((await getViewer()).status).toBe('authenticated');
  });

  it('invalidateViewerCache forces a re-check', async () => {
    const token = freshToken('logout');
    cookieJar.set('github_oauth_token', token);
    respondWith(200, GITHUB_USER);
    await getViewer();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await invalidateViewerCache(token);
    await getViewer();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the freshness window short enough to bound revocation lag', () => {
    expect(VIEWER_CACHE_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
  });
});

describe('getViewerToken', () => {
  it('returns the raw cookie value, separately from the viewer object', async () => {
    const token = freshToken('rawtoken');
    cookieJar.set('github_oauth_token', token);
    expect(await getViewerToken()).toBe(token);
  });

  it('returns null when there is no session cookie', async () => {
    expect(await getViewerToken()).toBeNull();
  });

  it('is not reachable from the Viewer object', async () => {
    const token = freshToken('noleak');
    cookieJar.set('github_oauth_token', token);
    respondWith(200, GITHUB_USER);
    const result = await getViewer();
    if (result.status !== 'authenticated') throw new Error('expected authenticated');
    expect(JSON.stringify(result.viewer)).not.toContain(token);
    expect(Object.keys(result.viewer).sort()).toEqual(['avatarUrl', 'id', 'login', 'name']);
  });
});
