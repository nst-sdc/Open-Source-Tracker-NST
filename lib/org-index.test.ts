import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvRead: vi.fn(async () => ({ ok: true, value: null })), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => {}) }));
vi.mock('./profile-cache', () => ({ readProfileCache: vi.fn(async () => null) }));
import { indexStudentContributions, orgIndexLooksIncomplete, studentsMissingFromIndex, rebuildOrgIndex, readOrgIndexForWrite, type OrgIndex } from './org-index';
import * as kv from './kv';

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

describe('org index self-healing', () => {
  const sum = (login: string, mergedPRs: number) => ({ profile: { login }, mergedPRs });

  it('names every student with counted merged PRs who is missing from the index', () => {
    const index: OrgIndex = {};
    indexStudentContributions(index, 'alice', { prs: [pr('apache/kafka', 1)] });
    const summaries = [sum('Alice', 1), sum('bob', 3), sum('carol', 2), sum('dave', 0)];
    expect(studentsMissingFromIndex(index, summaries)).toEqual(['bob', 'carol']);
    expect(orgIndexLooksIncomplete(index, summaries)).toBe(true);
    indexStudentContributions(index, 'bob', { prs: [pr('apache/spark', 2)] });
    indexStudentContributions(index, 'carol', { prs: [pr('kubeflow/kubeflow', 3)] });
    expect(orgIndexLooksIncomplete(index, summaries)).toBe(false);
    expect(orgIndexLooksIncomplete({}, [sum('nobody', 0)])).toBe(false);
  });

  it('applies the summary\'s own exclusion rule when given one', () => {
    const index: OrgIndex = {};
    indexStudentContributions(index, 'alice', { prs: [pr('apache/kafka', 1), pr('tiny/repo', 2)] }, {
      excludesPR: (repo) => repo === 'tiny/repo',
    });
    expect(Object.keys(index)).toEqual(['apache']);
  });

  it('reports a failed read so the caller does not write an empty index back', async () => {
    (kv.kvRead as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, value: null });
    expect(await readOrgIndexForWrite()).toEqual({ ok: false, index: {} });
    (kv.kvRead as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, value: null });
    expect(await readOrgIndexForWrite()).toEqual({ ok: true, index: {} });
  });

  it('rebuilds from every profile cache and stamps the time', async () => {
    const kvSet = kv.kvSet as unknown as ReturnType<typeof vi.fn>;
    kvSet.mockClear();
    const profiles: Record<string, { prs: unknown[] }> = {
      alice: { prs: [pr('apache/kafka', 1), pr('apache/spark', 2)] },
      bob: { prs: [pr('grafana/grafana', 3)] },
    };
    let flaky = 0;
    const index = await rebuildOrgIndex(
      [{ github: 'alice' }, { github: 'bob' }, { github: 'uncached' }],
      () => ({}),
      async (login) => {
        // First read of bob fails; the retry must save him.
        if (login === 'bob' && flaky++ === 0) throw new Error('burst');
        return (profiles[login] as never) ?? null;
      },
    );
    expect(index?.apache.contributors).toEqual({ alice: 2 });
    expect(index?.grafana.contributors).toEqual({ bob: 1 });
    expect(kvSet.mock.calls.map((c) => c[0])).toEqual(['org_index', 'org_index_rebuilt_at']);
  });
});

describe('contributorRepos and busiestRepo', () => {
  it('records each contributor\'s repos and names the busiest one', async () => {
    const { indexStudentContributions, busiestRepo } = await import('./org-index');
    const pr = (repo: string, n: number) => ({ number: n, repository_url: `https://api.github.com/repos/${repo}`, pull_request: { merged_at: '2026-01-01T00:00:00Z' } }) as never;
    const index = {} as Parameters<typeof indexStudentContributions>[0];
    indexStudentContributions(index, 'alice', { prs: [pr('apache/airflow', 1), pr('apache/airflow', 2), pr('apache/kafka', 3)] });
    indexStudentContributions(index, 'bob', { prs: [pr('apache/kafka', 4), pr('apache/kafka', 5)] });
    expect(index.apache.contributorRepos).toEqual({ alice: { 'apache/airflow': 2, 'apache/kafka': 1 }, bob: { 'apache/kafka': 2 } });
    expect(busiestRepo(index.apache)).toEqual({ repo: 'apache/kafka', merged: 3 });
    indexStudentContributions(index, 'bob', { prs: [] }); // bob's last PR there removed
    expect(index.apache.contributorRepos).toEqual({ alice: { 'apache/airflow': 2, 'apache/kafka': 1 } });
    expect(busiestRepo({})).toBeNull();
  });
});
