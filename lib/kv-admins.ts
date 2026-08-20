import { kvGet, kvSet } from './kv';

const KV_KEY = 'admin_usernames';

/** GitHub usernames granted admin access at runtime, on top of the
 * SEED_ADMIN_USERNAMES env var (see lib/admin-auth.ts). The seed list is
 * deploy-time config and can't be changed from the UI — this KV-backed list
 * is what the "manage admins" screen actually edits. */
export async function getDynamicAdminUsernamesKV(): Promise<string[]> {
  return (await kvGet<string[]>(KV_KEY)) || [];
}

export async function addAdminUsername(username: string): Promise<{ ok: boolean; message?: string }> {
  const lower = username.toLowerCase().trim();
  if (!lower) return { ok: false, message: 'GitHub username cannot be empty' };

  const list = await getDynamicAdminUsernamesKV();
  if (list.some((u) => u.toLowerCase() === lower)) {
    return { ok: false, message: `@${username} is already an admin` };
  }

  list.push(username.trim());
  await kvSet(KV_KEY, list);
  return { ok: true };
}

export async function removeAdminUsername(username: string): Promise<{ ok: boolean }> {
  const lower = username.toLowerCase().trim();
  const list = await getDynamicAdminUsernamesKV();
  const next = list.filter((u) => u.toLowerCase() !== lower);
  if (next.length === list.length) return { ok: false };
  await kvSet(KV_KEY, next);
  return { ok: true };
}
