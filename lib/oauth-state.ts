/**
 * lib/oauth-state.ts
 *
 * OAuth `state`: a CSRF nonce and a return-to path travelling together.
 *
 * The nonce closes a real hole. Without it, an attacker can drive a victim's
 * browser through the callback with an attacker-obtained `code`, planting the
 * *attacker's* token in the victim's cookie — and `callback/route.ts` then
 * adds that token to the shared refresh pool. That mattered before; it
 * matters more now that identity is derived purely from this cookie.
 *
 * The return-to rides in the same parameter and the same cookie because
 * splitting them would mean two nonces, two cookies and two expiry stories
 * for no gain.
 */
import { randomBytes } from 'node:crypto';

export const OAUTH_STATE_COOKIE = 'github_oauth_state';
/** Long enough for a slow sign-in, short enough that a stolen state is stale. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/** Top-level segments a student may be sent back to after signing in. */
const RETURN_ALLOWLIST = new Set([
  '',
  'achievers',
  'check-work',
  'contributors',
  'documentation',
  'get-started',
  'issues',
  'join',
  'kairi',
  'login',
  'programs',
  'repo-activity',
]);

/**
 * Accepts only same-site paths, so `state` can never become an open
 * redirect. Rejects protocol-relative `//evil.com` (which a browser reads as
 * an absolute URL), backslashes (which some parsers fold into slashes), and
 * anything under /api or /admin.
 */
export function sanitizeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  if (raw.length === 0 || raw.length > 128) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  if (raw.includes('\\') || raw.includes('@')) return '/';
  if (/[\u0000-\u001F\u007F]/.test(raw)) return '/';

  const [pathOnly] = raw.split(/[?#]/);
  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(pathOnly)) return '/';
  if (pathOnly.includes('..')) return '/';

  const first = pathOnly.split('/')[1] ?? '';
  if (!RETURN_ALLOWLIST.has(first)) return '/';
  return pathOnly;
}

export interface OAuthState {
  nonce: string;
  next: string;
}

export function createOAuthState(next: unknown): OAuthState {
  return { nonce: randomBytes(16).toString('hex'), next: sanitizeReturnPath(next) };
}

/** Encoded for the URL. Opaque to GitHub, which echoes it back verbatim. */
export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

export function decodeOAuthState(raw: string | null | undefined): OAuthState | null {
  if (!raw || raw.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const { nonce, next } = parsed as { nonce?: unknown; next?: unknown };
    if (typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) return null;
    return { nonce, next: sanitizeReturnPath(next) };
  } catch {
    return null;
  }
}

/**
 * Constant-time compare, so a mismatched nonce cannot be recovered by
 * timing the callback.
 */
export function nonceMatches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
