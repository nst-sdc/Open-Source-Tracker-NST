import { getSessionUser } from './session';
import { getDynamicAdminUsernamesKV } from './kv-admins';

/** Deploy-time admin allowlist — comma-separated GitHub usernames. Always
 * treated as admin regardless of the KV list, so there's always at least
 * one account that can bootstrap/manage the dynamic admin list without
 * needing to already have admin access. Not editable from the UI; change it
 * by redeploying with a different env var. */
function getSeedAdminUsernames(): string[] {
  return (process.env.SEED_ADMIN_USERNAMES ?? '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean);
}

/** Core check against the seed (env var) and dynamic (KV) admin lists, given
 * a username the caller already resolved — lets routes that already fetched
 * the GitHub session (e.g. /api/auth/session) check admin status without a
 * second GitHub /user round trip. */
export async function isAdminUsername(username: string): Promise<boolean> {
  const lower = username.toLowerCase();
  if (getSeedAdminUsernames().includes(lower)) return true;
  const dynamicAdmins = await getDynamicAdminUsernamesKV();
  return dynamicAdmins.some((u) => u.toLowerCase() === lower);
}

/** Whoever is currently signed in with GitHub, checked against the seed
 * (env var) and dynamic (KV, see lib/kv-admins.ts) admin lists. There is no
 * separate admin login anymore — admin access is just "this GitHub account
 * is on the admin list," resolved from the same OAuth session every other
 * signed-in feature already uses. */
export async function checkAdminAuth(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  return isAdminUsername(user.username);
}

/** Returns the signed-in GitHub username if (and only if) they're an admin,
 * otherwise null — for routes/UI that need the admin's own identity, not
 * just a yes/no check (e.g. preventing self-removal from the admin list). */
export async function getAdminUsername(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return (await checkAdminAuth()) ? user.username : null;
}
