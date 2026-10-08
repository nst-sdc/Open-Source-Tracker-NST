/* Client-safe half of the recognition feature: types and labels only.
   Kept apart from lib/recognitions.ts because that module reads KV (and so
   node:fs via the disk fallback), which cannot be imported into a client
   component -- ContributorGrid is one. */

export type RecognitionKind = 'program' | 'conference' | 'project';

export interface RecognitionItem {
  /** e.g. "GSoC · JSON Schema · 2026" */
  label: string;
  kind: RecognitionKind;
  /** Program.url when the Hall of Fame entry has one; many do not. */
  url?: string;
}

export interface Recognition {
  kinds: RecognitionKind[];
  items: RecognitionItem[];
}

export type RecognitionMap = Record<string, Recognition>;

export const KIND_LABEL: Record<RecognitionKind, string> = {
  program: 'Open source program',
  conference: 'Open source conference',
  project: 'Project built by an NST student',
};
