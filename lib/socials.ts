/**
 * lib/socials.ts
 *
 * Contact links a student chooses to show on their contributor page, so a
 * maintainer, recruiter or classmate who finds them on the leaderboard can
 * reach them. Everything here is opt-in and self-service: only the student
 * (signed in with the same GitHub account) can set or clear their own links;
 * an admin can clear anyone's.
 *
 * Stored per student under student_socials:<login>. Values are normalised
 * to full https URLs (or a bare handle for Discord) at write time, so the
 * page never has to trust what was typed.
 */
import { kvDel, kvGet, kvSet } from './kv';
import type { StudentSocials } from './socials-shared';

export * from './socials-shared';

const keyFor = (login: string) => `student_socials:${login.toLowerCase()}`;

export async function getSocials(login: string): Promise<StudentSocials | null> {
  const v = await kvGet<StudentSocials>(keyFor(login));
  return v && typeof v === 'object' && v.links ? v : null;
}

export async function saveSocials(login: string, socials: StudentSocials): Promise<boolean> {
  return kvSet(keyFor(login), socials);
}

export async function deleteSocials(login: string): Promise<boolean> {
  return kvDel(keyFor(login));
}
