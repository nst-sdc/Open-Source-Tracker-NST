// Client-safe: ContributorGrid imports this, so nothing here may reach KV / node:fs.

export type RecognitionKind = 'program' | 'conference' | 'project';

export interface RecognitionItem {
  label: string;
  kind: RecognitionKind;
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
