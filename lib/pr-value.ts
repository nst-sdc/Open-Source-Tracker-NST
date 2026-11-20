/**
 * lib/pr-value.ts
 *
 * What a merged pull request is worth on its own merits: the effort term E
 * that prScore() in lib/repo-score.ts always read as 1. The repo multiplier
 * says how valuable the PROJECT is; this says how valuable the CHANGE is,
 * from the files it touched and their line counts (GraphQL pullRequest
 * additions/deletions/files). Pure; the fetch lives in lib/github.ts.
 *
 *   E = size × caps + bonuses, clamped to [PR_VALUE_MIN, PR_VALUE_MAX]
 *
 * 1.0 is neutral (roughly a 20-line code change), so a typical PR scores
 * exactly what it did before and only outliers move: a one-line typo fix in
 * a README is worth 0.4–0.7, a feature with tests across several files up
 * to 2.0.
 */

export interface PRFileChange {
  path: string;
  additions: number;
  deletions: number;
  /** GraphQL PullRequestChangedFile.changeType: ADDED, MODIFIED, DELETED, RENAMED, … */
  changeType?: string;
}

export interface PRValueInput {
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PRFileChange[];
  labels?: string[];
  /** Review threads/approvals before merge (GraphQL reviews.totalCount). */
  reviews?: number;
}

export type PRKind = 'code' | 'tests' | 'docs' | 'content' | 'mixed';

/** Stored on the cached PR; small on purpose (every PR of every student carries one). */
export interface PRContribution {
  /** E, the effort term: PR_VALUE_MIN..PR_VALUE_MAX, 1 = neutral. */
  value: number;
  kind: PRKind;
  /** Code lines (additions + deletions in code and test files). */
  codeLines: number;
  /** Files changed, all kinds. */
  files: number;
  /** Short human reasons, e.g. "120 code lines", "tests added", "docs only". */
  reasons: string[];
  /** ISO time of the fetch; lets a later rule change refetch nothing. */
  at: string;
  /** Rule set version that produced `value`. Bump PR_VALUE_VERSION to recompute. */
  v: number;
}

export const PR_VALUE_VERSION = 1;
export const PR_VALUE_MIN = 0.4;
export const PR_VALUE_MAX = 2.0;
export const PR_VALUE_NEUTRAL = 1.0;

export const PR_VALUE_RULES = {
  /** Code lines at which the size term maxes out. */
  sizeCap: 500,
  /** Size term range: a one-line change scores sizeMin, sizeCap lines scores sizeMax. */
  sizeMin: 0.6,
  sizeMax: 1.4,
  /** A PR made only of documentation files never scores above this. */
  docsCap: 0.7,
  /** A PR made only of images, data, config, lockfiles or translations never scores above this. */
  contentCap: 0.5,
  /** Added lines in test files. */
  testsBonus: 0.3,
  /** New code files, or additions far outweighing deletions on a real change. */
  newCodeBonus: 0.2,
  /** Six or more code files touched. */
  breadthBonus: 0.2,
  breadthFiles: 6,
  /** Two or more reviews before merge. */
  reviewBonus: 0.1,
} as const;

const DOC_EXT = new Set(['md', 'mdx', 'rst', 'txt', 'adoc', 'asciidoc', 'org', 'tex', 'wiki']);
const CONTENT_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'pdf', 'mp3', 'mp4', 'wav', 'ogg', 'ttf', 'otf', 'woff', 'woff2',
  'json', 'yaml', 'yml', 'csv', 'tsv', 'toml', 'ini', 'cfg', 'conf', 'properties', 'lock', 'po', 'pot', 'xlf', 'xliff', 'arb', 'snap', 'patch', 'diff',
]);
const CONTENT_NAMES = new Set(['codeowners', 'license', 'licence', 'notice', 'authors', 'contributors', 'funding.yml', '.gitignore', '.gitattributes', '.editorconfig', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'cargo.lock', 'go.sum']);
const DOC_DIRS = ['docs', 'doc', 'documentation', 'wiki', 'guides', 'guide', 'manual', 'changelog', 'changelogs'];
const CONTENT_DIRS = ['locale', 'locales', 'i18n', 'l10n', 'translations', 'lang', 'assets', 'images', 'img', 'icons', 'fonts', 'static', 'public', 'fixtures', '__snapshots__', 'data', 'datasets'];
const TEST_DIRS = ['test', 'tests', 'spec', 'specs', '__tests__', 'testing', 'e2e', 'cypress', 'integration-tests', 'unit-tests'];

export type FileKind = 'code' | 'test' | 'docs' | 'content';

/** Which bucket a changed file belongs to. Unknown extensions count as code. */
export function classifyPath(path: string): FileKind {
  const lower = path.toLowerCase();
  const parts = lower.split('/');
  const name = parts[parts.length - 1] ?? '';
  const dirs = parts.slice(0, -1);
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  const base = name.slice(0, name.length - (ext ? ext.length + 1 : 0));

  if (dirs.some((d) => TEST_DIRS.includes(d))) return 'test';
  if (/(^|[._-])(test|tests|spec)([._-]|$)/.test(base) && !DOC_EXT.has(ext) && !CONTENT_EXT.has(ext)) return 'test';
  if (DOC_EXT.has(ext) || dirs.some((d) => DOC_DIRS.includes(d))) return 'docs';
  if (name === 'readme' || base === 'readme' || base === 'contributing' || base === 'code_of_conduct') return 'docs';
  if (CONTENT_NAMES.has(name) || CONTENT_EXT.has(ext) || dirs.some((d) => CONTENT_DIRS.includes(d))) return 'content';
  return 'code';
}

const DOCS_LABELS = ['documentation', 'docs', 'typo', 'readme'];

const clamp = (v: number) => Math.max(PR_VALUE_MIN, Math.min(PR_VALUE_MAX, Math.round(v * 100) / 100));

export function prValue(input: PRValueInput): Omit<PRContribution, 'at' | 'v'> {
  const R = PR_VALUE_RULES;
  const reasons: string[] = [];
  const kinds = { code: 0, test: 0, docs: 0, content: 0 };
  let codeLines = 0;
  let testAdditions = 0;
  let newCodeFiles = 0;
  let codeAdds = 0;
  let codeDels = 0;
  for (const f of input.files) {
    const k = classifyPath(f.path);
    kinds[k]++;
    if (k === 'code' || k === 'test') codeLines += f.additions + f.deletions;
    if (k === 'test') testAdditions += f.additions;
    if (k === 'code') {
      codeAdds += f.additions;
      codeDels += f.deletions;
      if ((f.changeType ?? '').toUpperCase() === 'ADDED') newCodeFiles++;
    }
  }
  // GitHub lists at most 100 files per PR here; beyond that trust the totals.
  if (input.files.length === 0 && input.changedFiles > 0) codeLines = input.additions + input.deletions;

  const codeish = kinds.code + kinds.test;
  const docsOnly = codeish === 0 && kinds.docs > 0 && kinds.content === 0;
  const contentOnly = codeish === 0 && kinds.content > 0 && kinds.docs === 0;
  const docsAndContent = codeish === 0 && kinds.docs > 0 && kinds.content > 0;
  const labels = (input.labels ?? []).map((l) => l.toLowerCase());
  const docsLabel = labels.some((l) => DOCS_LABELS.some((d) => l.includes(d)));

  // Size: log-scaled lines in code and test files.
  const lines = docsOnly || contentOnly || docsAndContent ? input.additions + input.deletions : codeLines;
  const t = Math.log(1 + Math.min(Math.max(0, lines), R.sizeCap)) / Math.log(1 + R.sizeCap);
  let value = R.sizeMin + (R.sizeMax - R.sizeMin) * t;
  reasons.push(docsOnly || contentOnly || docsAndContent ? `${lines} lines` : `${codeLines} code lines`);

  let kind: PRKind = 'code';
  if (contentOnly || docsOnly || docsAndContent) {
    // Docs and content scale inside their own band, PR_VALUE_MIN..cap, so a
    // two-line typo fix is not worth the same as a four-hundred-line guide.
    const cap = contentOnly ? R.contentCap : R.docsCap;
    value = PR_VALUE_MIN + (cap - PR_VALUE_MIN) * t;
    kind = contentOnly ? 'content' : 'docs';
    reasons.push(contentOnly ? 'images, data or config only' : 'docs only');
  } else {
    if (testAdditions > 0) {
      value += R.testsBonus;
      reasons.push('tests added');
      if (kinds.code === 0) kind = 'tests';
    }
    if (newCodeFiles > 0 || (codeAdds >= 30 && codeAdds >= 3 * codeDels)) {
      value += R.newCodeBonus;
      reasons.push(newCodeFiles > 0 ? `${newCodeFiles} new code file${newCodeFiles === 1 ? '' : 's'}` : 'mostly new code');
    }
    if (codeish >= R.breadthFiles) {
      value += R.breadthBonus;
      reasons.push(`${codeish} code files`);
    }
    if (kinds.docs > 0 || kinds.content > 0) kind = kind === 'tests' ? 'tests' : 'mixed';
    // A "documentation"/"typo" label on a code-looking PR (docstrings, comments)
    // is docs work: cap it unless the change is clearly substantial.
    if (docsLabel && codeLines < 30) {
      value = Math.min(value, R.docsCap);
      kind = 'docs';
      reasons.push('labelled documentation');
    }
  }
  if ((input.reviews ?? 0) >= 2 && kind !== 'content') {
    value += R.reviewBonus;
    reasons.push(`${input.reviews} reviews`);
  }
  return { value: clamp(value), kind, codeLines, files: input.files.length || input.changedFiles, reasons };
}

/* ── the switch ───────────────────────────────────────────────────────────
   Scoring is synchronous and runs in several places; like vouched orgs, the
   setting is primed from KV into this module (lib/kv-pr-value.ts) and read
   here. Off by default: PRs score as before until an admin turns it on. */
let weighting = false;
export function setPrValueWeighting(on: boolean): void { weighting = on; }
export function isPrValueWeighting(): boolean { return weighting; }

/** The effort term for a PR: its stored value when weighting is on and the
 *  PR has been measured, otherwise 1 (neutral) so unmeasured PRs are never
 *  penalised while the data fills in. */
export function valueOfPR(pr: { contribution?: PRContribution | null } | null | undefined): number {
  if (!weighting) return PR_VALUE_NEUTRAL;
  const v = pr?.contribution?.value;
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(PR_VALUE_MIN, Math.min(PR_VALUE_MAX, v)) : PR_VALUE_NEUTRAL;
}
