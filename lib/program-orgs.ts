import programOrgs from '@/data/program-orgs.json';

/**
 * GitHub orgs that run a mentorship program (GSoC 2025 and 2026, LFX, CNCF,
 * NumFOCUS, Eclipse, Apache), lowercased. data/program-orgs.json is a
 * snapshot of the programs' own published org lists, taken October 2026;
 * refresh it from the same sources when a new cycle's orgs are announced.
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

export function isProgramOrg(ownerLogin: string): boolean {
  return PROGRAM_ORGS.has(ownerLogin.toLowerCase());
}
