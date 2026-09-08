import { cookies } from 'next/headers';
import { randomBytes, createHash } from 'crypto';
import { kvDel, kvGet, kvSet } from './kv';

export const ADMIN_COOKIE_NAME = 'admin_session';
const SESSION_KEY_PREFIX = 'admin_session:';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

/**
 * Admin sessions are random 256-bit ids whose SHA-256 hash is stored in KV
 * with an 8h TTL. Knowing the cookie value is the only way to match a
 * session — unlike the old static 'authenticated' string, it cannot be
 * guessed, forged, or replayed after logout/expiry.
 */
export async function createAdminSession(): Promise<{ id: string; maxAge: number }> {
  const id = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(id).digest('hex');
  await kvSet(`${SESSION_KEY_PREFIX}${hash}`, { createdAt: Date.now() }, SESSION_TTL_SECONDS);
  return { id, maxAge: SESSION_TTL_SECONDS };
}

export async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const id = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!id) return false;
  const hash = createHash('sha256').update(id).digest('hex');
  return (await kvGet<{ createdAt: number }>(`${SESSION_KEY_PREFIX}${hash}`)) !== null;
}

export async function revokeAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const id = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (id) {
    const hash = createHash('sha256').update(id).digest('hex');
    await kvDel(`${SESSION_KEY_PREFIX}${hash}`);
  }
}
