import { describe, it, expect, afterEach } from 'vitest';
import { classifyPath, prValue, valueOfPR, setPrValueWeighting, lineMix, isTweak, PR_VALUE_RULES, PR_VALUE_MIN, PR_VALUE_MAX } from './pr-value';

const f = (path: string, additions = 10, deletions = 2, changeType = 'MODIFIED') => ({ path, additions, deletions, changeType });
const input = (files: ReturnType<typeof f>[], extra: Partial<Parameters<typeof prValue>[0]> = {}) => ({
  additions: files.reduce((a, x) => a + x.additions, 0), deletions: files.reduce((a, x) => a + x.deletions, 0), changedFiles: files.length, files, ...extra,
});

describe('classifyPath', () => {
  it('buckets files by directory, name and extension', () => {
    expect(classifyPath('src/app.ts')).toBe('code');
    expect(classifyPath('lib/weird.xyz')).toBe('code');
    expect(classifyPath('tests/test_app.py')).toBe('test');
    expect(classifyPath('src/__tests__/app.test.tsx')).toBe('test');
    expect(classifyPath('pkg/parser_test.go')).toBe('test');
    expect(classifyPath('README.md')).toBe('docs');
    expect(classifyPath('docs/guide/intro.rst')).toBe('docs');
    expect(classifyPath('CONTRIBUTING')).toBe('docs');
    expect(classifyPath('assets/logo.png')).toBe('content');
    expect(classifyPath('package-lock.json')).toBe('content');
    expect(classifyPath('locales/fr/messages.po')).toBe('content');
    expect(classifyPath('config/settings.yaml')).toBe('content');
    expect(classifyPath('docs/test.md')).toBe('docs'); // a doc named test is still a doc
  });
});

describe('prValue', () => {
  it('is neutral around a twenty-line code change and never leaves its bounds', () => {
    const v = prValue(input([f('src/a.ts', 15, 5)]));
    expect(v.value).toBeGreaterThan(0.95);
    expect(v.value).toBeLessThan(1.05);
    expect(v.kind).toBe('code');
    expect(v.reasons).toEqual(['20 code lines']);
    expect(prValue(input([f('src/a.ts', 0, 1)])).value).toBeGreaterThanOrEqual(PR_VALUE_MIN);
    const huge = prValue(input([...Array.from({ length: 12 }, (_, i) => f(`src/m${i}.ts`, 200, 10, 'ADDED')), f('tests/m.test.ts', 80, 0, 'ADDED')], { reviews: 3 }));
    expect(huge.value).toBe(PR_VALUE_MAX);
  });

  it('caps docs-only and content-only PRs, whatever their size', () => {
    const docs = prValue(input([f('README.md', 300, 100), f('docs/x.md', 50, 0)]));
    expect(docs.kind).toBe('docs');
    expect(docs.value).toBeLessThanOrEqual(PR_VALUE_RULES.docsCap);
    expect(docs.value).toBeGreaterThan(0.65);
    expect(docs.reasons).toContain('docs only');
    const typo = prValue(input([f('README.md', 1, 1)]));
    expect(typo.value).toBeLessThan(0.5); // a two-line typo fix sits near the floor
    const content = prValue(input([f('assets/a.png', 0, 0), f('package-lock.json', 900, 900)]));
    expect(content.kind).toBe('content');
    expect(content.value).toBe(PR_VALUE_RULES.contentCap);
    expect(prValue(input([f('README.md', 40, 2), f('img/x.svg', 5, 0)])).kind).toBe('docs');
  });

  it('rewards tests, new code, breadth and reviews', () => {
    const base = prValue(input([f('src/a.ts', 15, 5)])).value;
    const tests = prValue(input([f('src/a.ts', 15, 5), f('tests/a.test.ts', 30, 0)]));
    expect(prValue(input([f('src/a.ts', 15, 5), f('tests/a.test.ts', 2, 0)])).reasons).not.toContain('tests added'); // two lines is a tweak, not a test
    expect(tests.value).toBeGreaterThan(base + PR_VALUE_RULES.testsBonus); // more lines too
    expect(tests.reasons).toContain('tests added');
    const fresh = prValue(input([f('src/new.ts', 15, 5, 'ADDED')]));
    expect(fresh.value).toBeCloseTo(base + PR_VALUE_RULES.newCodeBonus, 2);
    expect(fresh.reasons).toContain('1 new code file');
    const wide = prValue(input(Array.from({ length: 6 }, (_, i) => f(`src/${i}.ts`, 3, 1))));
    expect(wide.reasons).toContain('6 code files');
    const reviewed = prValue(input([f('src/a.ts', 15, 5)], { reviews: 2 }));
    expect(reviewed.value).toBeCloseTo(base + PR_VALUE_RULES.reviewBonus, 2);
    expect(prValue(input([f('tests/only.test.ts', 40, 0)])).kind).toBe('tests');
  });

  it('treats a documentation-labelled small code change as docs', () => {
    const v = prValue(input([f('src/a.py', 3, 3)], { labels: ['documentation'] }));
    expect(v.kind).toBe('docs');
    expect(v.value).toBeLessThanOrEqual(PR_VALUE_RULES.docsCap);
    const big = prValue(input([f('src/a.py', 80, 20)], { labels: ['documentation'] }));
    expect(big.kind).toBe('code');
  });

  it('falls back to the totals when GitHub lists no files', () => {
    const v = prValue({ additions: 120, deletions: 30, changedFiles: 3, files: [] });
    expect(v.codeLines).toBe(150);
    expect(v.files).toBe(3);
  });
});

describe('valueOfPR', () => {
  afterEach(() => setPrValueWeighting(true));
  it('counts a measured PR by default, is neutral for an unmeasured one or when switched off', () => {
    const measured = { contribution: { value: 1.6, kind: 'code' as const, codeLines: 200, files: 4, reasons: [], at: '', v: 1 } };
    expect(valueOfPR(measured)).toBe(1.6); // on by default
    expect(valueOfPR({})).toBe(1);
    expect(valueOfPR({ contribution: { ...measured.contribution, value: 9 } })).toBe(PR_VALUE_MAX);
    setPrValueWeighting(false);
    expect(valueOfPR(measured)).toBe(1);
  });
});

describe('reading the diff', () => {
  const patch = (lines: string[]) => ['@@ -1,3 +1,9 @@', ...lines].join('\n');

  it('separates code, comments, blanks and reformatting in a TypeScript diff', () => {
    const p = patch([
      '+// a comment',
      '+/* block',
      '+ * still block',
      '+ */',
      '+',
      '+}',
      '+const x = 1;',
      '+export function f() { return x; }',
      '-  const y = 2;',
      '+const y = 2;', // same line, re-indented: formatting
      '-const gone = 3;',
    ]);
    expect(lineMix(p, 'src/a.ts')).toEqual({ code: 3, comment: 4, blank: 2, formatting: 2, tweak: 0 });
  });

  it('knows # comments and docstrings in Python and -- in SQL', () => {
    expect(lineMix(patch(['+# note', '+x = 1', '+"""', '+doc text', '+"""', '+y = 2']), 'app/m.py')).toEqual({ code: 2, comment: 4, blank: 0, formatting: 0, tweak: 0 });
    expect(lineMix(patch(['+-- comment', '+SELECT 1;']), 'db/q.sql')).toEqual({ code: 1, comment: 1, blank: 0, formatting: 0, tweak: 0 });
    expect(lineMix(patch(['+<!-- hidden -->', '+<div>x</div>']), 'index.html')).toEqual({ code: 1, comment: 1, blank: 0, formatting: 0, tweak: 0 });
  });

  it('scores a PR on its code lines alone: 50 code + 50 comment lines equals 50 code lines', () => {
    const code = Array.from({ length: 50 }, (_, i) => `+const v${i} = ${i};`);
    const comments = Array.from({ length: 50 }, (_, i) => `+// note ${i}`);
    const withComments = prValue({ additions: 100, deletions: 0, changedFiles: 1, files: [{ path: 'src/a.ts', additions: 100, deletions: 0, patch: patch([...code, ...comments]) }] });
    const codeOnly = prValue({ additions: 50, deletions: 0, changedFiles: 1, files: [{ path: 'src/a.ts', additions: 50, deletions: 0, patch: patch(code) }] });
    expect(withComments.value).toBe(codeOnly.value);
    expect(withComments.codeLines).toBe(50);
    expect(withComments.commentLines).toBe(50);
    expect(withComments.reasons[0]).toBe('50 code lines (50 comment lines not counted)');
    const more = prValue({ additions: 100, deletions: 0, changedFiles: 1, files: [{ path: 'src/a.ts', additions: 100, deletions: 0, patch: patch([...code, ...code]) }] });
    expect(more.value).toBeGreaterThan(codeOnly.value);
  });

  it('caps comment-only and formatting-only changes like docs and content', () => {
    const comments = prValue({ additions: 40, deletions: 0, changedFiles: 1, files: [{ path: 'src/a.ts', additions: 40, deletions: 0, patch: patch(Array.from({ length: 40 }, (_, i) => `+// ${i}`)) }] });
    expect(comments.kind).toBe('comments');
    expect(comments.value).toBeLessThanOrEqual(PR_VALUE_RULES.docsCap);
    const fmt = prValue({ additions: 30, deletions: 30, changedFiles: 1, files: [{ path: 'src/a.ts', additions: 30, deletions: 30, patch: patch([...Array.from({ length: 30 }, (_, i) => `-  let a${i} = ${i};`), ...Array.from({ length: 30 }, (_, i) => `+let a${i} = ${i};`)]) }] });
    expect(fmt.kind).toBe('formatting');
    expect(fmt.value).toBeLessThanOrEqual(PR_VALUE_RULES.contentCap);
    expect(fmt.reasons).toContain('whitespace and formatting only');
  });

  it('falls back to the line counts for a file without a patch', () => {
    const v = prValue({ additions: 60, deletions: 0, changedFiles: 1, files: [{ path: 'src/big.ts', additions: 60, deletions: 0 }] });
    expect(v.codeLines).toBe(60);
    expect(v.kind).toBe('code');
  });
});

describe('moves and small test edits', () => {
  const patch = (lines: string[]) => ['@@ -1,3 +1,3 @@', ...lines].join('\n');
  it('counts a moved line as code, not formatting: swapping two calls is a real fix', () => {
    const p = patch([
      '-        document.execCommand("createLink", false, url)',
      '-',
      '         this.save(selection.getRangeAt(0))',
      '+        document.execCommand("createLink", false, url)',
    ]);
    expect(lineMix(p, 'ui/src/editor.js')).toEqual({ code: 2, comment: 0, blank: 1, formatting: 0, tweak: 0 });
    const v = prValue({ additions: 1, deletions: 2, changedFiles: 1, files: [{ path: 'ui/src/editor.js', additions: 1, deletions: 2, patch: p }] });
    expect(v.kind).toBe('code');
    expect(v.value).toBeGreaterThan(PR_VALUE_RULES.contentCap);
  });
  it('still treats a re-indented line as formatting', () => {
    expect(lineMix(patch(['-  const a = 1;', '+const a = 1;']), 'src/a.ts')).toEqual({ code: 0, comment: 0, blank: 0, formatting: 2, tweak: 0 });
  });
  it('does not call a typo fix in a test comment "tests added"', () => {
    const v = prValue({ additions: 1, deletions: 1, changedFiles: 1, files: [{ path: 'test/a.test.ts', additions: 1, deletions: 1, patch: patch(['-// recieve', '+// receive']) }] });
    expect(v.reasons).not.toContain('tests added');
    expect(v.kind).toBe('comments');
    const real = prValue({ additions: 4, deletions: 0, changedFiles: 1, files: [{ path: 'test/a.test.ts', additions: 4, deletions: 0, patch: patch(['+it("x", () => {', '+  expect(f()).toBe(1);', '+  expect(g()).toBe(2);', '+});']) }] });
    expect(real.reasons).toContain('tests added');
    expect(real.kind).toBe('tests');
  });
});

describe('typo sweeps and renames', () => {
  const patch = (lines: string[]) => ['@@ -1,3 +1,3 @@', ...lines].join('\n');
  it('pairs a line that comes back with a few characters changed as a tweak', () => {
    const p = patch(['-for (const dependant of module.implicitlyLoadedAfter) {', '+for (const dependent of module.implicitlyLoadedAfter) {', '-  error(logNotIncluded(dependant));', '+  error(logNotIncluded(dependent));', '+const brandNew = compute();']);
    expect(lineMix(p, 'src/Graph.ts')).toEqual({ code: 1, comment: 0, blank: 0, formatting: 0, tweak: 2 });
    expect(isTweak('if (a < b) {', 'if (a <= b) {')).toBe(true);
    expect(isTweak('return foo(x);', 'return bar(y, z);')).toBe(false);
  });
  it('prices a forty-file typo sweep like docs work, not forty lines of code', () => {
    const files = Array.from({ length: 40 }, (_, i) => ({
      path: `src/m${i}.ts`, additions: 1, deletions: 1,
      patch: patch([`-  const dependant${i} = load(${i});`, `+  const dependent${i} = load(${i});`]),
    }));
    const v = prValue({ additions: 40, deletions: 40, changedFiles: 40, files, title: 'docs: fix various typos in source' });
    expect(v.kind).toBe('tweaks');
    expect(v.value).toBeLessThanOrEqual(PR_VALUE_RULES.docsCap);
    expect(v.reasons[0]).toContain('40 lines with a few characters changed');
    expect(v.reasons).not.toContain('40 code files');
  });
  it('a title saying docs or typo caps a small code change like a docs label does', () => {
    const v = prValue({ additions: 5, deletions: 5, changedFiles: 1, files: [{ path: 'src/a.ts', additions: 5, deletions: 5, patch: patch(['-const total = sum(items);', '+const total = sumAll(items, { strict: true });', '-let x = 1;', '+let x = compute(1, 2, 3);', '+export const y = 2;', '+export const z = 3;', '+export const w = 4;']) }], title: 'fix typos in parser' });
    expect(v.kind).toBe('docs');
    expect(v.value).toBeLessThanOrEqual(PR_VALUE_RULES.docsCap);
  });
  it('a real one-character fix still counts as code, just small', () => {
    const v = prValue({ additions: 1, deletions: 1, changedFiles: 1, files: [{ path: 'src/a.ts', additions: 1, deletions: 1, patch: patch(['-if (i < n) {', '+if (i <= n) {']) }], title: 'fix off-by-one in loop bound' });
    expect(v.kind).toBe('tweaks');
    expect(v.value).toBeGreaterThanOrEqual(PR_VALUE_MIN);
  });
});
