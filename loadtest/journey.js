// k6 load test: students using the site. One iteration is one student's
// visit: home, the interest form, the leaderboard and one page of it, a
// profile, organisations, programmes, with a few seconds of reading between
// pages. The arrival rate is visits per minute, so RATE=100 held for 40 min
// with a 10-min ramp either side is about 6,000 visits in the hour.
//
// Signed-in paths (form submission, Kairi) need a real GitHub session and
// are not simulated; the form's write path is covered by unit tests.
//
//   k6 run -e BASE_URL=https://os.nstsdc.org -e RATE=100 loadtest/journey.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://localhost:3007').replace(/\/+$/, '');
const RATE = Number(__ENV.RATE || 100);
const LOGINS = JSON.parse(open('./logins.json'));
// A UA the site's bot filter recognises, so the run never pollutes the
// usage or form-funnel counters; every route is still exercised.
const UA = 'k6-loadtest/1.0 (bot; NST tracker rehearsal)';

export const options = {
  scenarios: {
    students: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 120,
      maxVUs: 500,
      stages: [
        { duration: __ENV.RAMP || '10m', target: RATE },
        { duration: __ENV.HOLD || '40m', target: RATE },
        { duration: __ENV.DOWN || '10m', target: 0 },
      ],
    },
  },
  thresholds: {
    // Abort the run rather than keep hammering a site that is failing.
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '3m' }],
    'http_req_duration{kind:page}': ['p(95)<4000'],
    'http_req_duration{kind:api}': ['p(95)<2000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const page = (path, name) => {
  const res = http.get(`${BASE}${path}`, { headers: { 'User-Agent': UA }, tags: { kind: 'page', name } });
  check(res, { [`${name} 200`]: (r) => r.status === 200 });
  return res;
};
const api = (path, name) => {
  const res = http.get(`${BASE}${path}`, { headers: { 'User-Agent': UA }, tags: { kind: 'api', name } });
  check(res, { [`${name} 200`]: (r) => r.status === 200 });
  return res;
};
const think = (lo, hi) => sleep(lo + Math.random() * (hi - lo));

export default function () {
  page('/', 'home');
  think(2, 5);
  page('/interest', 'interest');
  api('/api/forms/interest', 'form-def');
  think(3, 8);
  page('/contributors', 'leaderboard');
  api('/api/leaderboard?section=active&offset=50&limit=50', 'leaderboard-page-2');
  think(2, 5);
  const login = LOGINS[Math.floor(Math.random() * LOGINS.length)];
  page(`/contributors/${login}`, 'profile');
  think(2, 5);
  if (Math.random() < 0.5) {
    page('/organizations', 'organizations');
    think(2, 4);
  }
  if (Math.random() < 0.5) {
    page('/programs', 'programs');
    think(1, 3);
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  const t = (k) => (m[k] && m[k].values) || {};
  const lines = [
    `requests ${t('http_reqs').count || 0}, failed ${((t('http_req_failed').rate || 0) * 100).toFixed(2)}%`,
    `pages p50 ${Math.round(t('http_req_duration{kind:page}')['med'] || 0)} ms, p95 ${Math.round(t('http_req_duration{kind:page}')['p(95)'] || 0)} ms, max ${Math.round(t('http_req_duration{kind:page}')['max'] || 0)} ms`,
    `api   p50 ${Math.round(t('http_req_duration{kind:api}')['med'] || 0)} ms, p95 ${Math.round(t('http_req_duration{kind:api}')['p(95)'] || 0)} ms, max ${Math.round(t('http_req_duration{kind:api}')['max'] || 0)} ms`,
    `visits completed ${t('iterations').count || 0}, peak VUs ${t('vus_max').max || t('vus_max').value || 0}`,
  ];
  return { stdout: '\n' + lines.join('\n') + '\n', 'summary.json': JSON.stringify(data, null, 2) };
}
