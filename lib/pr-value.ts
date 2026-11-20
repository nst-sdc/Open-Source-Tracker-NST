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
  /** Unified diff of this file (REST pulls/{n}/files `patch`); absent for very large files. */
  patch?: string;
}

/** What the added and removed lines of a diff are made of. */
export interface LineMix {
  /** Lines with logic in them: everything below taken out. */
  code: number;
  /** Comment-only lines, by the file's language. */
  comment: number;
  /** Blank, whitespace-only, or a lone bracket / punctuation. */
  blank: number;
  /** A removed line that comes back identical except for whitespace: re-indenting, reformatting. */
  formatting: number;
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

export type PRKind = 'code' | 'tests' | 'docs' | 'content' | 'mixed' | 'comments' | 'formatting';

/** Stored on the cached PR; small on purpose (every PR of every student carries one). */
export interface PRContribution {
  /** E, the effort term: PR_VALUE_MIN..PR_VALUE_MAX, 1 = neutral. */
  value: number;
  kind: PRKind;
  /** Substantive code lines (additions + deletions in code and test files, with
   *  comment-only, blank and formatting-only lines taken out when the diff was read). */
  codeLines: number;
  /** Comment-only lines seen in code and test files; never score, shown for honesty. */
  commentLines?: number;
  /** Files changed, all kinds. */
  files: number;
  /** Short human reasons, e.g. "120 code lines", "tests added", "docs only". */
  reasons: string[];
  /** ISO time of the fetch; lets a later rule change refetch nothing. */
  at: string;
  /** Rule set version that produced `value`. Bump PR_VALUE_VERSION to recompute. */
  v: number;
}

export const PR_VALUE_VERSION = 2;
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

/* ── reading the diff ─────────────────────────────────────────────────────
   GitHub's per-file counts treat a comment, a blank line and a line of logic
   alike. The patch tells them apart. */
const SLASH = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'java', 'c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'cs', 'go', 'rs', 'kt', 'kts', 'swift', 'scala', 'php', 'dart', 'm', 'mm', 'groovy', 'gradle', 'proto', 'css', 'scss', 'less', 'sass', 'vue', 'svelte']);
const HASH = new Set(['py', 'pyi', 'rb', 'sh', 'bash', 'zsh', 'fish', 'pl', 'pm', 'r', 'jl', 'ex', 'exs', 'nim', 'cr', 'ps1', 'tcl', 'awk', 'makefile', 'mk', 'cmake', 'dockerfile', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf']);
const DASH = new Set(['sql', 'lua', 'hs', 'lhs', 'elm', 'ada', 'adb', 'ads', 'vhd', 'vhdl']);
const ANGLE = new Set(['html', 'htm', 'xml', 'xhtml', 'svg', 'md', 'mdx', 'astro']);
const SEMI = new Set(['lisp', 'cl', 'el', 'clj', 'cljs', 'cljc', 'edn', 'scm', 'rkt', 'asm', 's']);
const PERCENT = new Set(['tex', 'sty', 'erl', 'hrl', 'm']);

type CommentSyntax = { line: string[]; blockOpen?: string; blockClose?: string; docstring?: boolean };
function commentSyntax(path: string): CommentSyntax {
  const name = path.toLowerCase().split('/').pop() ?? '';
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
  if (ext === 'py' || ext === 'pyi') return { line: ['#'], docstring: true };
  if (HASH.has(ext)) return { line: ['#'] };
  if (SLASH.has(ext)) return { line: ['//'], blockOpen: '/*', blockClose: '*/' };
  if (DASH.has(ext)) return { line: ['--'], blockOpen: '/*', blockClose: '*/' };
  if (ANGLE.has(ext)) return { line: [], blockOpen: '<!--', blockClose: '-->' };
  if (SEMI.has(ext)) return { line: [';'] };
  if (PERCENT.has(ext)) return { line: ['%'] };
  // Unknown language: the common prefixes, so a comment is still a comment.
  return { line: ['//', '#'], blockOpen: '/*', blockClose: '*/' };
}

const PUNCT_ONLY = /^[\s{}()[\];,.:]*$/;
const squash = (s: string) => s.replace(/\s+/g, '');

/** Classifies the added and removed lines of one file's unified diff. Pure. */
export function lineMix(patch: string, path: string): LineMix {
  const mix: LineMix = { code: 0, comment: 0, blank: 0, formatting: 0 };
  const syn = commentSyntax(path);
  const removed: string[] = [];
  const added: string[] = [];
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('@@') || raw.startsWith('\\')) continue;
    if (raw.startsWith('+')) added.push(raw.slice(1));
    else if (raw.startsWith('-')) removed.push(raw.slice(1));
  }
  // Formatting: a removed line that returns with only whitespace differences.
  const pool = new Map<string, number>();
  for (const r of removed) {
    const k = squash(r);
    if (k) pool.set(k, (pool.get(k) ?? 0) + 1);
  }
  const keepAdded: string[] = [];
  for (const a of added) {
    const k = squash(a);
    const n = k ? pool.get(k) ?? 0 : 0;
    if (n > 0) { pool.set(k, n - 1); mix.formatting += 2; }
    else keepAdded.push(a);
  }
  // What is left in the pool found no re-indented partner: real removals.
  const keepRemoved: string[] = [];
  for (const r of removed) {
    const k = squash(r);
    const n = k ? pool.get(k) ?? 0 : 0;
    if (n > 0) {
      pool.set(k, n - 1);
      keepRemoved.push(r);
    }
  }
  let inBlock = false;
  let inDoc = false;
  const classify = (line: string) => {
    const t = line.trim();
    if (inBlock) {
      mix.comment++;
      if (syn.blockClose && t.includes(syn.blockClose)) inBlock = false;
      return;
    }
    if (syn.docstring) {
      const q = (t.match(/"""|'''/g) ?? []).length;
      if (inDoc) { mix.comment++; if (q % 2 === 1) inDoc = false; return; }
      if (t.startsWith('"""') || t.startsWith("'''")) { mix.comment++; if (q % 2 === 1) inDoc = true; return; }
    }
    if (!t || PUNCT_ONLY.test(t)) { mix.blank++; return; }
    if (syn.line.some((p) => t.startsWith(p))) { mix.comment++; return; }
    if (syn.blockOpen && t.startsWith(syn.blockOpen)) {
      mix.comment++;
      if (!(syn.blockClose && t.includes(syn.blockClose, syn.blockOpen.length))) inBlock = true;
      return;
    }
    if (syn.blockOpen === '/*' && t.startsWith('*')) { mix.comment++; return; } // continuation of a block
    mix.code++;
  };
  for (const l of keepAdded) classify(l);
  inBlock = false; inDoc = false;
  for (const l of keepRemoved) classify(l);
  return mix;
}

const clamp = (v: number) => Math.max(PR_VALUE_MIN, Math.min(PR_VALUE_MAX, Math.round(v * 100) / 100));

export function prValue(input: PRValueInput): Omit<PRContribution, 'at' | 'v'> {
  const R = PR_VALUE_RULES;
  const reasons: string[] = [];
  const kinds = { code: 0, test: 0, docs: 0, content: 0 };
  let codeLines = 0;
  let commentLines = 0;
  let formattingLines = 0;
  let rawCodeLines = 0;
  let testAdditions = 0;
  let newCodeFiles = 0;
  let codeAdds = 0;
  let codeDels = 0;
  let readDiff = false;
  for (const f of input.files) {
    const k = classifyPath(f.path);
    kinds[k]++;
    if (k === 'code' || k === 'test') {
      rawCodeLines += f.additions + f.deletions;
      if (typeof f.patch === 'string' && f.patch.length > 0) {
        // The diff says what the lines are; comments, blanks and
        // re-indentation do not count as change.
        const mix = lineMix(f.patch, f.path);
        codeLines += mix.code;
        commentLines += mix.comment;
        formattingLines += mix.formatting;
        readDiff = true;
      } else {
        codeLines += f.additions + f.deletions;
      }
    }
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
  // Code files whose diff turned out to hold no logic: comments alone, or
  // whitespace and reformatting alone.
  const commentsOnly = readDiff && codeish > 0 && codeLines === 0 && commentLines > 0;
  const formattingOnly = readDiff && codeish > 0 && codeLines === 0 && commentLines === 0 && rawCodeLines > 0;
  const labels = (input.labels ?? []).map((l) => l.toLowerCase());
  const docsLabel = labels.some((l) => DOCS_LABELS.some((d) => l.includes(d)));

  // Size: log-scaled substantive lines in code and test files.
  const nonCode = docsOnly || contentOnly || docsAndContent;
  const lines = nonCode ? input.additions + input.deletions : commentsOnly ? commentLines : formattingOnly ? rawCodeLines : codeLines;
  const t = Math.log(1 + Math.min(Math.max(0, lines), R.sizeCap)) / Math.log(1 + R.sizeCap);
  let value = R.sizeMin + (R.sizeMax - R.sizeMin) * t;
  if (nonCode) reasons.push(`${lines} lines`);
  else if (commentsOnly) reasons.push(`${commentLines} comment lines, no code`);
  else if (formattingOnly) reasons.push(`${rawCodeLines} lines of formatting, no code`);
  else reasons.push(`${codeLines} code lines${commentLines > 0 ? ` (${commentLines} comment lines not counted)` : ''}${formattingLines > 0 ? ` (${formattingLines} formatting lines not counted)` : ''}`);

  let kind: PRKind = 'code';
  if (contentOnly || docsOnly || docsAndContent || commentsOnly || formattingOnly) {
    // Docs, content, comments and formatting scale inside their own band,
    // PR_VALUE_MIN..cap, so a two-line typo fix is not worth the same as a
    // four-hundred-line guide. Comments are docs; reformatting is content.
    const cap = contentOnly || formattingOnly ? R.contentCap : R.docsCap;
    value = PR_VALUE_MIN + (cap - PR_VALUE_MIN) * t;
    kind = contentOnly ? 'content' : formattingOnly ? 'formatting' : commentsOnly ? 'comments' : 'docs';
    reasons.push(contentOnly ? 'images, data or config only' : formattingOnly ? 'whitespace and formatting only' : commentsOnly ? 'comments only' : 'docs only');
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
  return { value: clamp(value), kind, codeLines, ...(commentLines > 0 ? { commentLines } : {}), files: input.files.length || input.changedFiles, reasons };
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
