import { describe, it, expect } from 'vitest';
import { buildHeatmap, heatLevel, mondayFirst, type MaintainerEvent } from './maintainer-heatmap';

// Noon local time keeps every event on the intended calendar day whatever
// zone the test runs in.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const ev = (t: string, who: string, kind: 'merged' | 'raised', n: number): MaintainerEvent => ({ t, who, kind, n, title: `pr ${n}` });

describe('buildHeatmap', () => {
  // 2026-11-02 is a Monday; the window is Mon 2 Nov → Sun 15 Nov 2026
  const since = new Date(2026, 10, 2);
  const until = new Date(2026, 10, 15, 23, 59);
  const events = [
    ev(at(2026, 11, 3), 'alice', 'merged', 1), // Tue
    ev(at(2026, 11, 3), 'alice', 'merged', 2), // Tue
    ev(at(2026, 11, 3), 'bob', 'raised', 3), // Tue
    ev(at(2026, 11, 7), 'bob', 'merged', 4), // Sat
    ev(at(2026, 11, 10), 'Alice', 'raised', 5), // Tue, next week, different case
    ev(at(2026, 10, 20), 'carol', 'merged', 6), // before the window
    ev(at(2026, 11, 20), 'carol', 'merged', 7), // after the window
  ];
  const h = buildHeatmap(events, since, until);

  it('lays out whole weeks Monday to Sunday and leaves days outside the window empty', () => {
    expect(h.weeks).toHaveLength(2);
    expect(h.weeks[0].map((d) => d?.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(h.weeks[0].every((d) => d !== null)).toBe(true);
    const padded = buildHeatmap([], new Date(2026, 10, 4), until); // starts on a Wednesday
    expect(padded.weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(padded.weeks[0][2]?.date).toBe('2026-11-04');
  });

  it('counts merges and raised PRs per day and per person, busiest person first', () => {
    const tue = h.weeks[0][1]!;
    expect(tue.merged).toBe(2);
    expect(tue.raised).toBe(1);
    expect(tue.people.map((p) => [p.login, p.merged, p.raised])).toEqual([['alice', 2, 0], ['bob', 0, 1]]);
    expect(tue.people[0].prs.map((p) => p.n)).toEqual([1, 2]);
    const withAuthor = buildHeatmap([{ ...events[0], by: 'dev1' }], since, until);
    expect(withAuthor.weeks[0][1]!.people[0].prs[0]).toEqual({ n: 1, kind: 'merged', title: 'pr 1', by: 'dev1' });
    expect(h.weeks[1][1]!.people[0].login).toBe('Alice'); // display case of the first event that day
  });

  it('ignores events outside the window and sums weekdays Monday first', () => {
    expect(h.total).toBe(5);
    expect(h.weekdayTotals).toEqual([0, 4, 0, 0, 0, 1, 0]);
    expect(h.busiest).toEqual([1]);
    expect(h.weekendShare).toBeCloseTo(0.2);
    expect(h.maxDay).toBe(3);
    expect(h.people).toBe(2); // alice and Alice are one person
  });

  it('handles an empty window', () => {
    const e = buildHeatmap([], since, until);
    expect(e.total).toBe(0);
    expect(e.busiest).toEqual([]);
    expect(e.weekendShare).toBe(0);
    expect(e.weeks[0][0]).toEqual({ date: '2026-11-02', weekday: 0, merged: 0, raised: 0, people: [] });
  });
});

describe('helpers', () => {
  it('maps Sunday to 6 and Monday to 0', () => {
    expect(mondayFirst(new Date(2026, 10, 1))).toBe(6); // 1 Nov 2026 is a Sunday
    expect(mondayFirst(new Date(2026, 10, 2))).toBe(0);
  });
  it('scales heat levels 1..4 against the busiest day, 0 for none', () => {
    expect(heatLevel(0, 8)).toBe(0);
    expect(heatLevel(1, 8)).toBe(1);
    expect(heatLevel(4, 8)).toBe(2);
    expect(heatLevel(8, 8)).toBe(4);
    expect(heatLevel(3, 0)).toBe(0);
  });
});
