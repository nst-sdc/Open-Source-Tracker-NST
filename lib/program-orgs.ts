import programOrgs from '@/data/program-orgs.json';

/**
 * GitHub orgs of well-known open-source organisations, lowercased: those
 * that run or take part in a mentorship programme (GSoC 2016–2021 archive,
 * GSoC 2025 and 2026, LFX, NumFOCUS), every CNCF landscape project, every
 * Eclipse Foundation project, Apache, and a curated list of foundations and
 * flagship communities (PSF, VideoLAN, OpenJS, GNOME, KDE, Wikimedia …).
 * data/program-orgs.json is a snapshot of the programmes' own published
 * lists (GSoC archive API, CNCF landscape.yml, Eclipse projects API), taken
 * October–November 2026; refresh it from the same sources when a new
 * cycle's orgs are announced.
 *
 * Used as a quality prior by the repo scorer: a repo under one of these orgs
 * is always valid and never priced below PROGRAM_ORG_FLOOR, whatever its own
 * stars say. A three-star Sugar Labs activity is still a GSoC project.
 */
export const PROGRAM_ORGS: ReadonlySet<string> = new Set(
  Object.values(programOrgs as Record<string, string[]>)
    .flat()
    .map((o) => o.toLowerCase()),
);

/** Organisations an admin vouched for from the dashboard (lib/kv-vouched-orgs.ts),
 *  loaded here so the synchronous scorer can consult them. Empty until primed. */
let vouchedOrgs: ReadonlySet<string> = new Set();

export function setVouchedOrgs(orgs: ReadonlySet<string>): void {
  vouchedOrgs = orgs;
}

export function isVouchedOrg(ownerLogin: string): boolean {
  return vouchedOrgs.has(ownerLogin.toLowerCase());
}

/** True for a program org or an admin-vouched one: both get the same treatment. */
export function isProgramOrg(ownerLogin: string): boolean {
  const lower = ownerLogin.toLowerCase();
  return PROGRAM_ORGS.has(lower) || vouchedOrgs.has(lower);
}
