/**
 * Covers when a cached repo is considered due for a fresh look. The interesting
 * cases are the ones that used to be impossible: an entry that is complete and
 * current-schema but simply old.
 */
import { describe, it, expect } from 'vitest';
import { isEntryStale, REPO_RECHECK_MS, RepoCacheEntry } from './repo-cache';
import { REPO_SCHEMA_VERSION, RepoSignals } from './repo-score';

const NOW = new Date('2026-09-07T00:00:00Z').getTime();

const signals: RepoSignals = {
  stars: 120, forks: 20, watchers: 8, releases: 3, contributors: 15,
  commitsLastYear: 400, mergedPRCount: 210, closedIssueCount: 90,
  languageCount: 3, topics: [], licenseSpdxId: 'MIT',
  isFork: false, isArchived: false, ownerLogin: 'someorg',
  createdAt: '2023-01-01T00:00:00Z', pushedAt: '2026-09-01T00:00:00Z',
};

/** A complete, current-schema entry last checked `agoMs` before NOW. */
function entry(agoMs: number, overrides: Partial<RepoCacheEntry> = {}): RepoCacheEntry {
  return {
    schemaVersion: REPO_SCHEMA_VERSION,
    stars: signals.stars,
    forks: signals.forks,
    valid: true,
    signals,
    checkedAt: new Date(NOW - agoMs).toISOString(),
    ...overrides,
  };
}

describe('isEntryStale', () => {
  it('treats a repo it has never seen as stale', () => {
    expect(isEntryStale(undefined, NOW)).toBe(true);
  });

  it('treats an entry written by an older schema as stale', () => {
    expect(isEntryStale(entry(0, { schemaVersion: 1 }), NOW)).toBe(true);
  });

  it('treats an entry with no signals as stale', () => {
    expect(isEntryStale(entry(0, { signals: undefined }), NOW)).toBe(true);
  });

  it('keeps a recently checked entry', () => {
    expect(isEntryStale(entry(REPO_RECHECK_MS / 2), NOW)).toBe(false);
  });

  // The bug this file exists for: before checkedAt, an entry like this was
  // considered fresh forever, so a repo's verdict never changed after the day
  // it was first seen.
  it('re-checks a complete entry once it passes the window', () => {
    expect(isEntryStale(entry(REPO_RECHECK_MS + 1), NOW)).toBe(true);
  });

  it('re-checks exactly on the boundary', () => {
    expect(isEntryStale(entry(REPO_RECHECK_MS), NOW)).toBe(true);
    expect(isEntryStale(entry(REPO_RECHECK_MS - 1), NOW)).toBe(false);
  });

  it('re-checks entries written before checkedAt existed', () => {
    expect(isEntryStale(entry(0, { checkedAt: undefined }), NOW)).toBe(true);
  });

  it('re-checks an entry whose timestamp is unparseable', () => {
    expect(isEntryStale(entry(0, { checkedAt: 'not a date' }), NOW)).toBe(true);
  });

  it('does not treat a future timestamp as stale', () => {
    // Clock skew between writers should age into the window, not out of it.
    expect(isEntryStale(entry(-REPO_RECHECK_MS), NOW)).toBe(false);
  });

  it('re-checks admin-overridden entries too, since the override pins validity not signals', () => {
    const overridden = entry(REPO_RECHECK_MS + 1, { manualOverride: true, valid: true });
    expect(isEntryStale(overridden, NOW)).toBe(true);
  });

  it('defaults to the current time when no clock is passed', () => {
    expect(isEntryStale({ ...entry(0), checkedAt: new Date().toISOString() })).toBe(false);
  });
});
