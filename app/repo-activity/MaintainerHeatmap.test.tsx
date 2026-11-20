import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaintainerHeatmap } from './MaintainerHeatmap';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();

describe('MaintainerHeatmap', () => {
  const activity = {
    since: new Date(2026, 10, 2).toISOString(), // Monday
    until: new Date(2026, 10, 15, 23).toISOString(),
    mergesKnown: true,
    events: [
      { t: at(2026, 11, 3), who: 'walter', kind: 'merged' as const, n: 1, title: 'Fix the thing' },
      { t: at(2026, 11, 3), who: 'walter', kind: 'merged' as const, n: 2, title: 'Fix another' },
      { t: at(2026, 11, 8), who: 'zara', kind: 'raised' as const, n: 3, title: 'Sunday idea' }, // Sunday
    ],
  };
  const html = renderToStaticMarkup(<MaintainerHeatmap activity={activity} />);

  it('renders a Monday-to-Sunday grid with one column per week and a weekday pattern', () => {
    expect(html).toContain('When maintainers are active');
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(html).toContain(`>${d}<`);
    // 14 real days in two weeks; each real day carries a title
    expect(html.match(/title="2026-11-\d\d: \d+ events?"/g)?.length).toBe(14);
    expect(html).toContain('title="2026-11-03: 2 events"');
    expect(html).toContain('title="2026-11-08: 1 event"');
  });

  it('summarises the busiest weekday and the weekend share', () => {
    expect(html).toContain('Busiest on Tuesday');
    expect(html).toContain('33% at weekends');
    expect(html).toContain('2 maintainers active');
  });

  it('says so when merges could not be attributed', () => {
    const noToken = renderToStaticMarkup(<MaintainerHeatmap activity={{ ...activity, mergesKnown: false, events: [] }} />);
    expect(noToken).toContain('merges unknown without a GitHub token');
    expect(noToken).toContain('No pull request raised by a maintainer in this period.');
  });
});
