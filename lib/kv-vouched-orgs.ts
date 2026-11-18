/**
 * lib/kv-vouched-orgs.ts
 *
 * Organisations an admin has vouched for. Every repo under one passes the
 * validity gate and is priced no lower than a mentorship-program repo, the
 * same treatment data/program-orgs.json gives GSoC/LFX/CNCF orgs
 * automatically. This list is for the cases that list cannot know: a
 * project's second org (jenkins-infra beside jenkinsci), a community whose
 * repos are real but small, a judgment call after someone has looked.
 *
 * Deliberately not "every org passes": anyone can create an org in a
 * minute, and measured on the roster an org-only gate mostly re-admits the
 * students' own club repos. See docs/DOCUMENTATION.md "Vouched organisations".
 */
import { kvRead, kvSet } from './kv';
import { setVouchedOrgs } from './program-orgs';

export const KV_KEY = 'vouched_orgs';
const PRIME_TTL_MS = 5 * 60 * 1000;

export interface VouchedOrg {
  /** GitHub login of the organisation, as typed (matched case-insensitively). */
  login: string;
  addedAt: string;
  note?: string;
}

export const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

let lastGood: VouchedOrg[] | null = null;
let primedAt = 0;

export async function getVouchedOrgs(): Promise<VouchedOrg[]> {
  const { ok, value } = await kvRead<VouchedOrg[]>(KV_KEY);
  if (ok) {
    lastGood = Array.isArray(value) ? value : [];
    return lastGood;
  }
  // Store unreachable: the gate must not loosen on a failed read, so fall
  // back to what this process last saw, else to nothing vouched.
  return lastGood ?? [];
}

/**
 * Loads the list into lib/program-orgs so the synchronous scoring code sees
 * it. Cheap to call often: one store read per PRIME_TTL_MS per process.
 */
export async function primeVouchedOrgs(force = false): Promise<void> {
  if (!force && Date.now() - primedAt < PRIME_TTL_MS) return;
  const list = await getVouchedOrgs();
  setVouchedOrgs(new Set(list.map((v) => v.login.toLowerCase())));
  primedAt = Date.now();
}

export async function addVouchedOrg(login: string, note?: string): Promise<{ ok: boolean; message?: string }> {
  const clean = login.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').split('/')[0];
  if (!LOGIN_RE.test(clean)) return { ok: false, message: 'That is not a GitHub organisation login.' };
  const { ok, value } = await kvRead<VouchedOrg[]>(KV_KEY);
  if (!ok) return { ok: false, message: 'The store did not answer; try again in a minute.' };
  const list = Array.isArray(value) ? value : [];
  if (list.some((v) => v.login.toLowerCase() === clean.toLowerCase())) return { ok: false, message: `${clean} is already vouched for.` };
  list.push({ login: clean, addedAt: new Date().toISOString(), ...(note?.trim() ? { note: note.trim() } : {}) });
  if (!(await kvSet(KV_KEY, list))) return { ok: false, message: 'The store did not accept the change.' };
  lastGood = list;
  await primeVouchedOrgs(true);
  return { ok: true };
}

export async function removeVouchedOrg(login: string): Promise<{ ok: boolean; message?: string }> {
  const { ok, value } = await kvRead<VouchedOrg[]>(KV_KEY);
  if (!ok) return { ok: false, message: 'The store did not answer; try again in a minute.' };
  const list = Array.isArray(value) ? value : [];
  const next = list.filter((v) => v.login.toLowerCase() !== login.trim().toLowerCase());
  if (next.length === list.length) return { ok: false, message: 'Not on the list.' };
  if (!(await kvSet(KV_KEY, next))) return { ok: false, message: 'The store did not accept the change.' };
  lastGood = next;
  await primeVouchedOrgs(true);
  return { ok: true };
}

/** Test hook. */
export function _resetVouchedMemory(): void {
  lastGood = null;
  primedAt = 0;
  setVouchedOrgs(new Set());
}
