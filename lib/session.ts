/**
 * lib/session.ts
 *
 * The one place that answers "who is calling?".
 *
 * Before this module, callers derived identity from the `github_username`
 * cookie. That cookie is client-supplied, so anyone could send
 *
 *   Cookie: github_oauth_token=anything; github_username=<victim>
 *
 * and be treated as <victim> — enough to read another student's standing
 * through the agent, and enough to reset their own per-user rate limits by
 * rotating one string. The fix is structural, not a patch: the login now
 * comes only from GitHub's own answer to `GET /user` for the presented
 * token. There is no code path here that reads a name out of a cookie.
 *
 * The result is a discriminated union rather than `string | null` so that
 * callers cannot accidentally collapse "not signed in" (a 401) into
 * "GitHub is unreachable" (a 503). Getting that distinction wrong is how a
 * provider outage turns into every student being silently signed out.
 */
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { kvDel, kvGet, kvSet } from './kv';
import { checkRateLimit, getClientIp } from './rate-limit';

export const SESSION_COOKIE = 'github_oauth_token';

/** How long a verified identity is trusted without re-asking GitHub. */
export const VIEWER_CACHE_TTL_SECONDS = 10 * 60;
/** Rejections are cached far more briefly — a student who just signed in
 *  must not be told "expired" for ten minutes because of one stale 401. */
export const INVALID_CACHE_TTL_SECONDS = 60;

/** Cache-miss validations allowed per IP per hour. Skipped for 'unknown'. */
const AUTH_CHECK_PER_IP_HOURLY = 60;
/** Global backstop on cache-miss validations per day. */
const AUTH_CHECK_DAILY_DEFAULT = 5000;

export interface Viewer {
  /** GitHub's immutable numeric account id. Rate limits key on this, never
   *  on the login — a username rename must not mint fresh quota. */
  id: number;
  login: string;
  name: string;
  avatarUrl: string;
}

export type SessionResult =
  | { status: 'authenticated'; viewer: Viewer }
  | { status: 'anonymous' } // no cookie presented
  | { status: 'invalid' } // GitHub said 401: expired, revoked, or forged
  | { status: 'unavailable' }; // 403 / 5xx / timeout / network — we do not know

type CachedSession = { v: 1; viewer: Viewer } | { v: 1; invalid: true };

function authCheckDailyBudget(): number {
  const raw = Number(process.env.AUTH_CHECK_DAILY_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : AUTH_CHECK_DAILY_DEFAULT;
}

/**
 * Cache key for a token. Plain SHA-256, no pepper: a keyed hash would only
 * matter if the KV contents were the threat, and this same KV already
 * stores plaintext OAuth tokens under `github_token_pool`. Adding a secret
 * here would buy nothing while costing an env var and a rollout step.
 * The token itself is never stored — only the digest, as a lookup handle.
 */
export function viewerCacheKey(token: string): string {
  return `ghid:${createHash('sha256').update(token).digest('hex')}`;
}

/**
 * A cheap sanity filter so obviously-junk cookies never reach GitHub. This
 * is cost control, not a security control: anything plausible-looking still
 * goes to GitHub and is rejected there. Deliberately permissive about the
 * prefix, because GitHub has shipped ghp_/gho_/ghu_/ghs_/github_pat_ over
 * the years and the local dev shortcut injects whatever GITHUB_TOKEN holds.
 */
function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,255}$/.test(token);
}

function toViewer(data: unknown): Viewer | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { id?: unknown; login?: unknown; name?: unknown; avatar_url?: unknown };
  if (typeof d.id !== 'number' || !Number.isFinite(d.id)) return null;
  if (typeof d.login !== 'string' || d.login.length === 0 || d.login.length > 39) return null;
  return {
    id: d.id,
    login: d.login,
    name: typeof d.name === 'string' && d.name.trim() ? d.name.slice(0, 80) : d.login,
    avatarUrl: typeof d.avatar_url === 'string' && d.avatar_url.startsWith('https://') ? d.avatar_url : '',
  };
}

/**
 * The raw session token, for server-to-server GitHub calls made *on behalf
 * of the caller*. Deliberately a separate function from getViewer(): the
 * Viewer object gets passed around and occasionally serialized into
 * responses, and a token must never ride along on it.
 *
 * Callers must treat a non-null return as "the caller presented this" — not
 * as "this is valid". Check getViewer() first.
 */
export async function getViewerToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE)?.value ?? null;
  } catch {
    // cookies() throws outside a request scope (e.g. static rendering).
    return null;
  }
}

/** Drops a cached identity immediately — used by logout so signing out is
 *  not followed by up to VIEWER_CACHE_TTL_SECONDS of continued access. */
export async function invalidateViewerCache(token: string): Promise<void> {
  try {
    await kvDel(viewerCacheKey(token));
  } catch {
    // Best-effort: logout must succeed even when KV is unreachable.
  }
}

/**
 * Resolves the caller's GitHub identity from the session cookie.
 *
 * @param request passed by Route Handlers so cache-miss validations can be
 *   bucketed per IP. Server Components omit it; the global ceiling still
 *   applies.
 */
export async function getViewer(request?: Request): Promise<SessionResult> {
  const token = await getViewerToken();
  if (!token) return { status: 'anonymous' };
  if (!isPlausibleToken(token)) return { status: 'invalid' };

  const key = viewerCacheKey(token);

  try {
    const cached = await kvGet<CachedSession>(key);
    if (cached && cached.v === 1) {
      if ('invalid' in cached) return { status: 'invalid' };
      const { id, login } = cached.viewer;
      if (typeof id === 'number' && typeof login === 'string' && login) {
        return { status: 'authenticated', viewer: cached.viewer };
      }
    }
  } catch {
    // A KV read failure must not deny a signed-in student: fall through to
    // asking GitHub directly, which is the authoritative answer anyway.
  }

  // Spend guards, checked before the network call. An attacker rotating
  // tokens defeats the negative cache (every value is a fresh key), so the
  // real brake is here. Fail-closed to `unavailable`: 503 is honest about
  // "we could not check", where 401 would wrongly accuse the student.
  if (request) {
    // 'unknown' is one shared bucket for everyone behind a proxy that strips
    // forwarding headers — and NST students all share a campus NAT — so
    // bucketing it would lock out a whole lecture theatre at once.
    const ip = getClientIp(request);
    if (ip !== 'unknown') {
      const perIp = await checkRateLimit(`rl:authcheck:ip:${ip}`, AUTH_CHECK_PER_IP_HOURLY, 60 * 60);
      if (!perIp.allowed) {
        console.warn(`[session] auth-check IP budget exhausted for ${ip}`);
        return { status: 'unavailable' };
      }
    }
  }
  const global = await checkRateLimit('rl:authcheck:global', authCheckDailyBudget(), 24 * 60 * 60);
  if (!global.allowed) {
    console.error('[session] global auth-check budget exhausted — refusing to validate');
    return { status: 'unavailable' };
  }

  let res: Response;
  try {
    res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error('[session] GitHub /user request failed:', error);
    return { status: 'unavailable' };
  }

  // Only an explicit 401 means "this token is bad". GitHub answers 403 for
  // secondary rate limits and abuse detection, and treating that as
  // `invalid` would delete a valid student's cookie *and* evict their token
  // from the shared refresh pool — degrading the whole pipeline because
  // GitHub was briefly grumpy.
  if (res.status === 401) {
    await kvSet<CachedSession>(key, { v: 1, invalid: true }, INVALID_CACHE_TTL_SECONDS).catch(() => {});
    return { status: 'invalid' };
  }
  if (!res.ok) {
    console.warn(`[session] GitHub /user returned ${res.status}; treating as unavailable`);
    return { status: 'unavailable' };
  }

  const viewer = toViewer(await res.json().catch(() => null));
  if (!viewer) {
    console.error('[session] GitHub /user returned an unrecognized body');
    return { status: 'unavailable' };
  }

  await kvSet<CachedSession>(key, { v: 1, viewer }, VIEWER_CACHE_TTL_SECONDS).catch(() => {});
  return { status: 'authenticated', viewer };
}
