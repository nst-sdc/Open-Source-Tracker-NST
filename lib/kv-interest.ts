/**
 * lib/kv-interest.ts
 *
 * The open-source interest form: one registration per GitHub account,
 * keyed on GitHub's immutable numeric id so a username rename cannot make
 * a duplicate. Identity (id, login, avatar) always comes from the signed-in
 * session, never from the request body; the body supplies only what GitHub
 * does not know: name as the student wants it, college email, batch and
 * campus. Re-submitting updates the existing row in place.
 */
import { kvGet, kvSet } from './kv';
import { type InterestInput, type InterestRegistration } from './interest-form';

export * from './interest-form';

export const KV_KEY = 'interest_registrations';

export async function getInterestRegistrations(): Promise<InterestRegistration[]> {
  const list = await kvGet<InterestRegistration[]>(KV_KEY);
  return Array.isArray(list) ? list : [];
}

export async function findInterestRegistration(githubId: number): Promise<InterestRegistration | null> {
  return (await getInterestRegistrations()).find((r) => r.githubId === githubId) ?? null;
}

/**
 * Inserts or updates the signed-in account's registration. Returns the
 * stored row and whether it was new. Exported with an injectable list
 * reader/writer so the merge rule is testable without the store.
 */
export async function upsertInterestRegistration(
  viewer: { id: number; login: string; avatarUrl?: string },
  input: InterestInput,
  nowIso = new Date().toISOString(),
  io: { read: () => Promise<InterestRegistration[]>; write: (list: InterestRegistration[]) => Promise<boolean> } = {
    read: getInterestRegistrations,
    write: (list) => kvSet(KV_KEY, list),
  },
): Promise<{ ok: true; registration: InterestRegistration; created: boolean } | { ok: false; error: string }> {
  const list = await io.read();
  const i = list.findIndex((r) => r.githubId === viewer.id);
  const base = i >= 0 ? list[i] : null;
  const registration: InterestRegistration = {
    githubId: viewer.id,
    github: viewer.login,
    avatarUrl: viewer.avatarUrl || base?.avatarUrl,
    ...input,
    createdAt: base?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  if (i >= 0) list[i] = registration;
  else list.push(registration);
  if (!(await io.write(list))) return { ok: false, error: 'The store did not accept the registration. Please try again.' };
  return { ok: true, registration, created: i < 0 };
}
