import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveOrganization,
  getOrgCache,
  saveOrgCache,
  fuzzyMatchScore,
  getSearchSuggestions,
} from './org-cache';

vi.mock('./kv', () => {
  let memoryKv: Record<string, unknown> = {};
  return {
    kvGet: vi.fn(async (key: string) => memoryKv[key] ?? null),
    kvSet: vi.fn(async (key: string, val: unknown) => {
      memoryKv[key] = val;
    }),
    __resetMemoryKv: () => {
      memoryKv = {};
    },
  };
});

vi.mock('./github', () => ({
  getGitHubHeaders: vi.fn(async () => ({
    Accept: 'application/vnd.github.v3+json',
  })),
}));

vi.mock('./summary-cache', () => ({
  readSummaryCache: vi.fn(async () => ({
    cachedAt: new Date().toISOString(),
    summaries: [
      {
        profile: {
          login: 'sanjana2505006',
          name: 'Sanjana',
          avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
        },
        mergedPRs: 52,
        totalPRs: 60,
        scoreMergedPRs: 180,
        campus: 'ADYPU',
        year: '2nd year',
        issuesCount: 5,
      },
      {
        profile: {
          login: 'rahul99',
          name: 'Rahul Sharma',
          avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4',
        },
        mergedPRs: 30,
        totalPRs: 35,
        scoreMergedPRs: 95,
        campus: 'Rishihood',
        year: '3rd year',
        issuesCount: 2,
      },
    ],
  })),
}));

vi.mock('./profile-cache', () => ({
  readProfileCache: vi.fn(async (username: string) => {
    if (username === 'sanjana2505006') {
      return {
        cachedAt: new Date().toISOString(),
        profile: { login: 'sanjana2505006' },
        prs: [
          {
            id: 101,
            repository_url: 'https://api.github.com/repos/apache/airflow',
            pull_request: { merged_at: '2026-09-01T00:00:00Z' },
          },
          {
            id: 102,
            repository_url: 'https://api.github.com/repos/appwrite/appwrite',
            pull_request: { merged_at: '2026-09-02T00:00:00Z' },
          },
          {
            id: 103,
            repository_url: 'https://api.github.com/repos/AryanVBW/personal-project',
            pull_request: { merged_at: '2026-09-03T00:00:00Z' },
          },
          {
            id: 104,
            repository_url: 'https://api.github.com/repos/unverifiedOwner/unverified-repo',
            pull_request: { merged_at: '2026-09-04T00:00:00Z' },
          },
          {
            id: 105,
            repository_url: 'https://api.github.com/repos/smallorg/tool',
            pull_request: { merged_at: '2026-09-05T00:00:00Z' },
          },
        ],
        issues: [],
      };
    }
    if (username === 'rahul99') {
      return {
        cachedAt: new Date().toISOString(),
        profile: { login: 'rahul99' },
        prs: [
          {
            id: 201,
            repository_url: 'https://api.github.com/repos/apache/kafka',
            pull_request: { merged_at: '2026-09-03T00:00:00Z' },
          },
        ],
        issues: [],
      };
    }
    return null;
  }),
}));

describe('lib/org-cache', () => {
  beforeEach(async () => {
    const kvModule = (await import('./kv')) as unknown as { __resetMemoryKv: () => void };
    kvModule.__resetMemoryKv();
    vi.restoreAllMocks();
  });

  describe('fuzzyMatchScore', () => {
    it('gives highest score for exact match', () => {
      expect(fuzzyMatchScore('apache', 'apache')).toBe(100);
      expect(fuzzyMatchScore('@apache', 'apache')).toBe(100);
    });

    it('gives high score for prefix match', () => {
      expect(fuzzyMatchScore('ap', 'apache')).toBe(90);
      expect(fuzzyMatchScore('apac', 'apache')).toBe(90);
    });

    it('gives substring match score', () => {
      expect(fuzzyMatchScore('pach', 'apache')).toBe(75);
    });

    it('handles typo / subsequence matching', () => {
      const score = fuzzyMatchScore('apch', 'apache');
      expect(score).toBeGreaterThanOrEqual(50);
    });

    it('returns 0 for non-matching strings', () => {
      expect(fuzzyMatchScore('xyz', 'apache')).toBe(0);
      expect(fuzzyMatchScore('', 'apache')).toBe(0);
    });
  });

  describe('getSearchSuggestions - Account Type Filtering', () => {
    beforeEach(async () => {
      await saveOrgCache({
        apache: {
          login: 'apache',
          name: 'Apache Software Foundation',
          type: 'Organization',
          isOrganization: true,
          checkedAt: new Date().toISOString(),
        },
        appwrite: {
          login: 'appwrite',
          name: 'Appwrite',
          type: 'Organization',
          isOrganization: true,
          checkedAt: new Date().toISOString(),
        },
        aryanvbw: {
          login: 'AryanVBW',
          name: 'Aryan VBW',
          type: 'User',
          isOrganization: false,
          checkedAt: new Date().toISOString(),
        },
        smallorg: {
          login: 'smallorg',
          name: 'Small Org',
          type: 'Organization',
          isOrganization: true,
          checkedAt: new Date().toISOString(),
        },
      });
    });

    // 1. Organization account -> included
    it('1. includes verified organization accounts in suggestions', async () => {
      const res = await getSearchSuggestions('ap');
      const logins = res.organizations.map((o) => o.login.toLowerCase());
      expect(logins).toContain('apache');
      expect(logins).toContain('appwrite');

      const apache = res.organizations.find((o) => o.login.toLowerCase() === 'apache');
      expect(apache?.contributorsCount).toBe(2);
      expect(apache?.mergedPRs).toBe(2);
    });

    // 2. User account -> excluded
    it('2. explicitly excludes verified User accounts from organization suggestions', async () => {
      const res = await getSearchSuggestions('aryan');
      const orgLogins = res.organizations.map((o) => o.login.toLowerCase());
      expect(orgLogins).not.toContain('aryanvbw');
    });

    // 3. Small organization -> still included
    it('3. includes small legitimate organizations with few contributors', async () => {
      const res = await getSearchSuggestions('small');
      const orgLogins = res.organizations.map((o) => o.login.toLowerCase());
      expect(orgLogins).toContain('smallorg');
      const smallOrg = res.organizations.find((o) => o.login.toLowerCase() === 'smallorg');
      expect(smallOrg?.contributorsCount).toBe(1);
      expect(smallOrg?.mergedPRs).toBe(1);
    });

    // 4. Unknown/unverified owner -> not assumed to be an organization
    it('5. excludes unknown/unverified owners present in PR data', async () => {
      const res = await getSearchSuggestions('unverified');
      const orgLogins = res.organizations.map((o) => o.login.toLowerCase());
      expect(orgLogins).not.toContain('unverifiedowner');
    });

    it('returns matching contributors', async () => {
      const res = await getSearchSuggestions('sanj');
      expect(res.contributors.length).toBeGreaterThan(0);
      expect(res.contributors[0].login).toBe('sanjana2505006');
    });

    it('returns empty result for empty query', async () => {
      const res = await getSearchSuggestions('');
      expect(res.organizations).toEqual([]);
      expect(res.contributors).toEqual([]);
    });
  });

  describe('resolveOrganization', () => {
    it('rejects invalid or empty organization queries', async () => {
      expect(await resolveOrganization('')).toBeNull();
      expect(await resolveOrganization('a')).toBeNull();
      expect(await resolveOrganization('foo bar')).toBeNull();
      expect(await resolveOrganization('foo/bar')).toBeNull();
    });

    // 4. Cached organization -> no unnecessary API request
    it('4. returns cached organization without making unnecessary API requests', async () => {
      await saveOrgCache({
        apache: {
          login: 'apache',
          name: 'Apache Software Foundation',
          type: 'Organization',
          isOrganization: true,
          checkedAt: new Date().toISOString(),
        },
      });

      const fetchSpy = vi.spyOn(global, 'fetch');
      const result = await resolveOrganization('Apache');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.login).toBe('apache');
      expect(result?.name).toBe('Apache Software Foundation');
      expect(result?.isOrganization).toBe(true);
    });

    it('queries GitHub API and caches valid organization when not in cache', async () => {
      const mockOrg = {
        login: 'facebook',
        name: 'Meta',
        type: 'Organization',
        public_repos: 120,
        description: 'Open source projects from Meta',
        avatar_url: 'https://avatars.githubusercontent.com/u/69631?v=4',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockOrg,
      } as unknown as Response);

      const result = await resolveOrganization('facebook');
      expect(result).not.toBeNull();
      expect(result?.login).toBe('facebook');
      expect(result?.name).toBe('Meta');
      expect(result?.isOrganization).toBe(true);
      expect(result?.publicRepos).toBe(120);

      // Verify written to cache
      const cache = await getOrgCache();
      expect(cache['facebook']).toBeDefined();
      expect(cache['facebook'].isOrganization).toBe(true);
    });

    it('returns null and caches negative result for 404', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      const result = await resolveOrganization('notanorg123xyz');
      expect(result).toBeNull();

      const cache = await getOrgCache();
      expect(cache['notanorg123xyz']).toBeDefined();
      expect(cache['notanorg123xyz'].isOrganization).toBe(false);
    });
  });
});
