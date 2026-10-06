import { describe, it, expect } from 'vitest';
import { indexStudentContributions, type OrgIndex } from './org-index';

const pr = (repo: string, n: number) => ({
  number: n,
  repository_url: `https://api.github.com/repos/${repo}`,
  pull_request: { merged_at: '2026-01-01T00:00:00Z' },
}) as never;

describe('org index', () => {
  it('keeps a contributor when a later PR spells the owner differently', () => {
    const index: OrgIndex = {};
    // first student establishes entry.login = 'Apache'
    indexStudentContributions(index, 'alice', { prs: [pr('Apache/kafka', 1)] });
    // second student's PR URL spells it lowercase
    indexStudentContributions(index, 'bob', { prs: [pr('apache/spark', 2)] });

    expect(Object.keys(index)).toEqual(['apache']);
    expect(index.apache.contributors).toEqual({ alice: 1, bob: 1 });
    expect(index.apache.mergedPRs).toBe(2);
  });

  it('does not drop a student when re-indexed with different owner casing', () => {
    const index: OrgIndex = {};
    indexStudentContributions(index, 'alice', { prs: [pr('Apache/kafka', 1)] });
    // alice is re-indexed on a later refresh; this time the URL is lowercase
    indexStudentContributions(index, 'alice', { prs: [pr('apache/kafka', 1)] });

    expect(index.apache?.contributors.alice).toBe(1);
    expect(index.apache?.mergedPRs).toBe(1);
  });

  it('replaces a student\'s count on re-index rather than stacking it', () => {
    const index: OrgIndex = {};
    indexStudentContributions(index, 'alice', { prs: [pr('apache/a', 1), pr('apache/b', 2)] });
    expect(index.apache.mergedPRs).toBe(2);

    // same student indexed again on a later refresh, now with three PRs
    indexStudentContributions(index, 'alice', {
      prs: [pr('apache/a', 1), pr('apache/b', 2), pr('apache/c', 3)],
    });
    expect(index.apache.contributors.alice).toBe(3);
    expect(index.apache.mergedPRs).toBe(3);
  });

  it('drops a student from an org once their last PR there is filtered out', () => {
    const index: OrgIndex = {};
    indexStudentContributions(index, 'alice', { prs: [pr('apache/a', 1)] });
    indexStudentContributions(index, 'bob', { prs: [pr('apache/b', 2)] });
    expect(index.apache.mergedPRs).toBe(2);

    // alice's only apache PR is flagged
    indexStudentContributions(index, 'alice', { prs: [pr('apache/a', 1)] }, {
      flaggedPRIds: new Set(['apache/a#1']),
    });
    expect(index.apache.contributors).toEqual({ bob: 1 });
    expect(index.apache.mergedPRs).toBe(1);
  });

  it('removes the org entirely when its last contributor goes', () => {
    const index: OrgIndex = {};
    indexStudentContributions(index, 'alice', { prs: [pr('solo/x', 1)] });
    expect(index.solo).toBeDefined();

    indexStudentContributions(index, 'alice', { prs: [pr('solo/x', 1)] }, {
      isRepoValid: () => false,
    });
    expect(index.solo).toBeUndefined();
  });

  it('ignores unmerged PRs', () => {
    const index: OrgIndex = {};
    indexStudentContributions(index, 'alice', {
      prs: [{ number: 1, repository_url: 'https://api.github.com/repos/apache/a', pull_request: { merged_at: null } } as never],
    });
    expect(index.apache).toBeUndefined();
  });
});
