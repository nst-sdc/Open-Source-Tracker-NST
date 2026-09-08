import { describe, it, expect } from 'vitest';
import {
  createOAuthState,
  decodeOAuthState,
  encodeOAuthState,
  nonceMatches,
  sanitizeReturnPath,
} from './oauth-state';

describe('sanitizeReturnPath', () => {
  it.each([
    ['/kairi', '/kairi'],
    ['/', '/'],
    ['/get-started', '/get-started'],
    ['/check-work', '/check-work'],
    ['/contributors/octocat', '/contributors/octocat'],
    ['/kairi?seed=stuck', '/kairi'],
    ['/issues#top', '/issues'],
  ])('keeps the same-site path %s', (input, expected) => {
    expect(sanitizeReturnPath(input)).toBe(expected);
  });

  it.each([
    ['a protocol-relative host', '//evil.example.com'],
    ['an absolute URL', 'https://evil.example.com/x'],
    ['a backslash host', '/\\evil.example.com'],
    ['userinfo smuggling', '/@evil.example.com'],
    ['a path outside the allowlist', '/api/auth/logout'],
    ['the admin area', '/admin/dashboard'],
    ['traversal', '/contributors/../../etc/passwd'],
    ['a relative path', 'kairi'],
    ['an empty string', ''],
    ['a non-string', 42],
    ['an overlong path', '/' + 'a'.repeat(200)],
  ])('refuses %s', (_label, input) => {
    expect(sanitizeReturnPath(input as unknown)).toBe('/');
  });

  it('refuses a newline-obfuscated redirect', () => {
    expect(sanitizeReturnPath('/kairi\n/../..//evil.example.com')).toBe('/');
  });
});

describe('state encoding', () => {
  it('round-trips a state', () => {
    const state = createOAuthState('/kairi');
    const decoded = decodeOAuthState(encodeOAuthState(state));
    expect(decoded).toEqual(state);
  });

  it('mints a distinct 128-bit nonce each time', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createOAuthState('/').nonce));
    expect(nonces.size).toBe(50);
    for (const n of nonces) expect(n).toMatch(/^[a-f0-9]{32}$/);
  });

  it('sanitizes the return path on the way in and on the way out', () => {
    expect(createOAuthState('//evil.example.com').next).toBe('/');
    const forged = Buffer.from(
      JSON.stringify({ nonce: 'a'.repeat(32), next: '//evil.example.com' }),
      'utf8',
    ).toString('base64url');
    expect(decodeOAuthState(forged)?.next).toBe('/');
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['not base64', '!!!!'],
    ['valid base64, not JSON', Buffer.from('nope', 'utf8').toString('base64url')],
    ['JSON without a nonce', Buffer.from(JSON.stringify({ next: '/' }), 'utf8').toString('base64url')],
    [
      'a malformed nonce',
      Buffer.from(JSON.stringify({ nonce: 'zz', next: '/' }), 'utf8').toString('base64url'),
    ],
    ['an oversized blob', 'A'.repeat(600)],
  ])('decodes %s to null', (_label, input) => {
    expect(decodeOAuthState(input as string | null)).toBeNull();
  });
});

describe('nonceMatches', () => {
  it('matches identical nonces and rejects everything else', () => {
    const a = 'a'.repeat(32);
    expect(nonceMatches(a, a)).toBe(true);
    expect(nonceMatches(a, 'b'.repeat(32))).toBe(false);
    expect(nonceMatches(a, 'a'.repeat(31))).toBe(false);
    expect(nonceMatches(a, '')).toBe(false);
  });
});
