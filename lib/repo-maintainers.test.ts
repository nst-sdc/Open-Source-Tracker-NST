import { describe, it, expect } from 'vitest';
import { deriveMaintainers, isBotAccount, fetchRecentMergers } from './repo-maintainers';

describe('deriveMaintainers', () => {
  it('unions every signal, lowercased, and always includes the owner', () => {
    const m = deriveMaintainers({
      owner: 'Jenkins-Infra',
      collaborators: ['Alice'],
      publicMembers: ['Bob'],
      mergers: ['MarkEWaite', ''],
      associations: [
        { login: 'carol', association: 'MEMBER' },
        { login: 'dave', association: 'CONTRIBUTOR' },
        { login: 'erin', association: null },
      ],
    });
    expect([...m].sort()).toEqual(['alice', 'bob', 'carol', 'jenkins-infra', 'markewaite']);
  });
});

describe('isBotAccount', () => {
  it('recognises GitHub bots by type, [bot] suffix and known logins', () => {
    expect(isBotAccount({ login: 'github-actions[bot]', type: 'Bot' })).toBe(true);
    expect(isBotAccount({ login: 'jenkins-infra-changelog-generator[bot]' })).toBe(true);
    expect(isBotAccount({ login: 'dependabot' })).toBe(true);
    expect(isBotAccount({ login: 'robot-lover', type: 'User' })).toBe(false);
    expect(isBotAccount(null)).toBe(false);
  });
});

describe('fetchRecentMergers', () => {
  it('returns null without a token, so the caller knows the signal is absent', async () => {
    expect(await fetchRecentMergers('o', 'r', { Accept: 'x' })).toBeNull();
  });
});
