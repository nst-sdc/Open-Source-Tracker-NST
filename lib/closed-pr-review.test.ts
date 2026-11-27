import { describe, it, expect } from 'vitest';
import { classifyClosedPr, anonymizeQuote, summarizeClosedPrs, flagsIn, isBotLogin, type PrDetail } from './closed-pr-review';

const meta = { repo: 'apache/airflow', number: 1, url: 'https://github.com/apache/airflow/pull/1', title: 'Fix', login: 'asha', campus: 'ADYPU', year: '2nd year', createdAt: '2026-03-10T00:00:00Z' };
const detail = (over: Partial<PrDetail>): PrDetail => ({
  state: 'CLOSED', closedAt: '2026-03-12T00:00:00Z', additions: 10, deletions: 2, author: { login: 'asha' },
  labels: { nodes: [] }, timelineItems: { nodes: [] }, comments: { nodes: [] }, reviews: { nodes: [] }, reviewThreads: { nodes: [] }, ...over,
});

describe('classifyClosedPr', () => {
  it('calls out an AI-generated PR closed by a maintainer and keeps the quote with its flags', () => {
    const r = classifyClosedPr(meta, detail({
      timelineItems: { nodes: [{ actor: { login: 'potiuk' } }] },
      comments: { nodes: [{ author: { login: 'potiuk' }, body: 'This PR was clearly AI generated and you have not reviewed it. If this continues you will be banned.' }, { author: { login: 'asha' }, body: 'sorry' }] },
    }));
    expect(r.closedBy).toBe('maintainer');
    expect(r.reason).toBe('AI-generated / low-effort / spam');
    expect(r.flags).toEqual(expect.arrayContaining(['ai', 'warning']));
    expect(r.quotes).toHaveLength(1);
    expect(r.quotes[0]).toMatchObject({ by: 'maintainer', login: 'potiuk' });
  });
  it('separates withdrawn-with-feedback, withdrawn-silently, bot-stale, process and silent maintainer closes', () => {
    const self = (over: Partial<PrDetail>) => classifyClosedPr(meta, detail({ timelineItems: { nodes: [{ actor: { login: 'Asha' } }] }, ...over }));
    expect(self({}).reason).toBe('withdrawn by student, no feedback');
    expect(self({ reviews: { nodes: [{ author: { login: 'm' }, state: 'CHANGES_REQUESTED', body: 'please add tests' }] } }).reason).toBe('withdrawn by student after feedback');
    expect(classifyClosedPr(meta, detail({ timelineItems: { nodes: [{ actor: { login: 'github-actions[bot]' } }] } })).reason).toBe('stale, closed by a bot');
    expect(classifyClosedPr(meta, detail({ timelineItems: { nodes: [{ actor: { login: 'm' } }] }, comments: { nodes: [{ author: { login: 'm' }, body: 'Please open an issue first and get assigned.' }] } })).reason).toBe('process: no issue, not assigned, CLA');
    expect(classifyClosedPr(meta, detail({ timelineItems: { nodes: [{ actor: { login: 'm' } }] } })).reason).toBe('closed by maintainer, no comment');
    expect(classifyClosedPr(meta, detail({ timelineItems: { nodes: [{ actor: { login: 'm' } }] }, labels: { nodes: [{ name: 'duplicate' }] } })).reason).toBe('duplicate / superseded');
  });
  it('ignores bot comments for the reason but keeps bot login detection', () => {
    expect(isBotLogin('coderabbitai')).toBe(true);
    expect(isBotLogin('dependabot[bot]')).toBe(true);
    expect(isBotLogin('potiuk')).toBe(false);
    const r = classifyClosedPr(meta, detail({ timelineItems: { nodes: [{ actor: { login: 'm' } }] }, comments: { nodes: [{ author: { login: 'coderabbitai' }, body: 'This looks AI generated' }] } }));
    expect(r.reason).toBe('closed by maintainer, no comment');
    expect(r.quotes).toHaveLength(0);
  });
  it('flagsIn finds several signals in one comment', () => {
    expect(flagsIn('Looks AI generated. Please open an issue first. Stop pinging people.')).toEqual(expect.arrayContaining(['ai', 'process', 'ping']));
  });
});

describe('anonymizeQuote', () => {
  it('removes mentions, profile links, emails, hidden html and the student name', () => {
    const q = anonymizeQuote('@asha-rao this looks AI generated. See https://github.com/asha-rao and mail me at m@x.io <!-- bot --> Asha, please stop.', ['asha-rao', 'Asha']);
    expect(q).toBe('@… this looks AI generated. See https://github.com/… and mail me at …@…  …, please stop.'.replace('  ', ' '));
  });
});

describe('summarizeClosedPrs', () => {
  it('counts reasons, owners, months, campuses and students, and ranks flagged quotes by seriousness', () => {
    const a = classifyClosedPr(meta, detail({ timelineItems: { nodes: [{ actor: { login: 'm' } }] }, comments: { nodes: [{ author: { login: 'm' }, body: 'AI generated, you will be banned' }] } }));
    const b = classifyClosedPr({ ...meta, number: 2, login: 'ravi', campus: 'SMRU', createdAt: '2026-04-01T00:00:00Z' }, detail({ timelineItems: { nodes: [{ actor: { login: 'm' } }] }, comments: { nodes: [{ author: { login: 'm' }, body: 'please rebase, tests are failing' }] } }));
    const s = summarizeClosedPrs([a, b]);
    expect(s.total).toBe(2);
    expect(s.reasons[0].count).toBe(1);
    expect(s.byOwner).toEqual([{ owner: 'apache', count: 2, top: expect.any(String) }]);
    expect(s.byMonth.map((m) => [m.month, m.closed, m.ai, m.warnings])).toEqual([['2026-03', 1, 1, 1], ['2026-04', 1, 0, 0]]);
    expect(s.students[0]).toMatchObject({ login: 'asha', closed: 1, ai: 1, warnings: 1 });
    expect(s.flagged[0].key).toBe('apache/airflow#1');
    expect(s.flagged[0].flags).toEqual(expect.arrayContaining(['ai', 'warning']));
  });
});
