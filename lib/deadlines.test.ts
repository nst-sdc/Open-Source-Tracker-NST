import { describe, it, expect } from 'vitest';
import { DEADLINES, countdown, formatCountdown, formatDate, milestoneTime, nextMilestone, upcoming } from './deadlines';

describe('programme deadlines', () => {
  const now = Date.parse('2026-11-24T10:00:00Z');

  it('counts a bare date to the end of that day, UTC', () => {
    expect(milestoneTime('2027-01-04')).toBe(Date.parse('2027-01-04T23:59:59Z'));
    expect(formatDate('2027-01-04')).toBe('4 Jan 2027');
  });

  it('picks the next milestone and formats the countdown', () => {
    const mlh = DEADLINES.find((d) => d.id === 'mlh-spring-2027')!;
    expect(nextMilestone(mlh, now)?.label).toBe('applications close');
    const c = countdown(milestoneTime('2027-01-04'), now);
    expect(c.days).toBe(41);
    expect(formatCountdown(c)).toBe('41d 13h');
    expect(formatCountdown(countdown(now + 2 * 3_600_000 + 5 * 60_000, now))).toBe('2h 05m');
    expect(formatCountdown(countdown(now + 30_000, now))).toBe('1m');
    expect(formatCountdown(countdown(now - 1, now))).toBe('now');
    expect(nextMilestone(mlh, Date.parse('2028-01-01T00:00:00Z'))).toBeNull();
  });

  it('orders upcoming deadlines by their next milestone and drops finished ones', () => {
    const list = upcoming(DEADLINES, now);
    // Only the LFX programmes are on the ticker for now; the rest stay in the file, hidden.
    expect(list.map((x) => x.deadline.id)).toEqual(['riscv-lfx-spring-2027', 'cncf-lfx-2027-t1']);
    expect(list[0].next.label).toBe('selected programmes notified');
    expect(upcoming(DEADLINES, Date.parse('2030-01-01T00:00:00Z'))).toEqual([]);
  });

  it('every entry has a source and at least one milestone', () => {
    for (const d of DEADLINES) {
      expect(d.milestones.length).toBeGreaterThan(0);
      expect(d.source.length).toBeGreaterThan(10);
      expect(d.url).toMatch(/^https:\/\//);
      for (const m of d.milestones) expect(Number.isFinite(milestoneTime(m.at))).toBe(true);
    }
  });
});
