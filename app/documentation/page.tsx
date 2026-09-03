import { ArchitectureDiagram, CachingFlowDiagram } from './Diagrams';

export const metadata = {
  title: 'Documentation — Opensource Tracker NST',
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'System architecture' },
  { id: 'data-model', label: 'Data model & caching' },
  { id: 'ranking', label: 'The ranking formula' },
  { id: 'spam', label: 'Spam & data integrity' },
  { id: 'refresh', label: 'Staying fresh' },
  { id: 'auth', label: 'Authentication' },
  { id: 'admin', label: 'Admin system' },
  { id: 'deployment', label: 'Deployment' },
  { id: 'local-dev', label: 'Local development' },
  { id: 'tradeoffs', label: 'Known tradeoffs' },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-[22px] font-[650] text-ink tracking-[-0.01em] pt-2 scroll-mt-24">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-ink-mid leading-[1.7] mt-3">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="text-[13px] bg-panel border border-line rounded-md px-1.5 py-0.5 text-ink-mid font-mono">{children}</code>;
}

function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  const styles = tone === 'warn'
    ? 'bg-warning-0 border-warning-200 text-warning-800'
    : 'bg-brand-0 border-brand-100 text-brand-700';
  return <div className={`border rounded-xl px-4 py-3 mt-4 text-[13.5px] leading-relaxed ${styles}`}>{children}</div>;
}

export default function DocumentationPage() {
  return (
    <main className="min-h-screen bg-panel">
      <div className="bg-ground border-b border-line">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
          <span className="text-[11px] font-[650] text-brand-600 bg-brand-0 rounded-full px-3 py-1 tracking-[0.06em] uppercase">
            Internal documentation
          </span>
          <h1 className="text-[32px] md:text-[38px] font-[650] tracking-[-0.02em] text-ink mt-3">
            How the Opensource Tracker actually works
          </h1>
          <p className="text-ink-soft text-[15.5px] mt-2 max-w-2xl leading-relaxed">
            A complete, accurate tour of the system — architecture, data flow, the ranking formula, and the operational
            realities of running it on a single physical node. Not linked from the site navigation; bookmark this URL.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 flex gap-10">
        <nav className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-8 space-y-0.5">
            <p className="text-ink-faint text-[10.5px] font-[650] uppercase tracking-[0.08em] px-3 mb-2">On this page</p>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}
                className="block px-3 py-1.5 rounded-lg text-[13.5px] text-ink-soft hover:text-ink hover:bg-ground transition-colors">
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-w-0 max-w-3xl space-y-14">

          <section>
            <H2 id="overview">Overview</H2>
            <P>
              This is a leaderboard that tracks real GitHub contributions — merged pull requests and issues — from NST
              students across the entire open-source ecosystem, not just one org&apos;s repos. It pulls data through
              GitHub&apos;s REST and Search APIs, ranks students by a repo-quality-weighted score (not raw PR count),
              and surfaces it on a public dashboard with an admin layer for moderation and a &quot;Hall of Fame&quot;
              for verified program placements (GSoC, LFX, Outreachy, and similar).
            </P>
            <P>
              The whole system runs as one Next.js application, backed by a single Redis-compatible key-value store
              (Upstash), deployed on one physical Kubernetes node. There is no separate backend service — API routes
              inside the same Next.js app do everything: fetching from GitHub, reading/writing the cache, serving
              pages, and handling admin actions.
            </P>
          </section>

          <section>
            <H2 id="architecture">System architecture</H2>
            <P>
              Four moving pieces: the app itself, the cache, GitHub&apos;s API, and a scheduled job that keeps the
              cache from going stale. Everything is reachable from the outside world through exactly one path.
            </P>
            <div className="mt-5"><ArchitectureDiagram /></div>
            <P>
              <strong className="text-ink">Cloudflare Tunnel</strong> is the load-bearing piece most people don&apos;t
              think about. A daemon called <Code>cloudflared</Code> runs on the node and opens an outbound-only
              connection to Cloudflare&apos;s edge — the node never has an inbound port open, so there&apos;s nothing
              for a bot to scan or brute-force. The same tunnel carries both the public website traffic and SSH access
              for maintainers. That&apos;s efficient, but it means one thing going down takes out two things at once —
              this has happened in production and is the single biggest operational risk in the whole system.
            </P>
          </section>

          <section>
            <H2 id="data-model">Data model & caching</H2>
            <P>
              Three separate caches, each solving a different problem, all living in the same Redis store:
            </P>
            <ul className="mt-3 space-y-2.5">
              <li className="text-[15px] text-ink-mid leading-[1.7]">
                <strong className="text-ink">
                  <Code>profile_cache:&#123;username&#125;</Code>
                </strong> — one entry per tracked student: their GitHub profile, every PR, every issue. This is the
                only place that ever holds raw data fetched directly from GitHub.
              </li>
              <li className="text-[15px] text-ink-mid leading-[1.7]">
                <strong className="text-ink">
                  <Code>summary_cache:&#123;period&#125;</Code>
                </strong> — a precomputed, sorted leaderboard for a given time window (<Code>all</Code>,{' '}
                <Code>week</Code>, <Code>month</Code>, etc). This is what a page load actually reads — recombining
                ~1,800 profile caches on every single visit would be needlessly slow.
              </li>
              <li className="text-[15px] text-ink-mid leading-[1.7]">
                <strong className="text-ink">
                  <Code>repo_cache_map</Code>
                </strong> — one entry per distinct repository ever touched by a tracked student: stars, forks, and a{' '}
                <Code>valid</Code> flag from spam filtering. Shared across every student who has a PR into that repo,
                so it&apos;s fetched once per repo, not once per PR.
              </li>
            </ul>
            <div className="mt-5"><CachingFlowDiagram /></div>
          </section>

          <section>
            <H2 id="ranking">The ranking formula</H2>
            <P>
              The leaderboard doesn&apos;t rank by merged-PR count directly — a PR into a real, used project should
              count for more than one into a farm repo set up to harvest contributions. Every constant below is
              deliberately public (<Code>lib/repo-score.ts</Code>): you should be able to see exactly why one PR
              scored higher than another, and what kind of project is worth your time.
            </P>
            <P>Each repo gets a quality multiplier <strong className="text-ink">M</strong> built in three stages:</P>
            <div className="bg-ground border border-line rounded-2xl shadow-card p-5 mt-4 font-mono text-[13.5px] text-ink-mid leading-relaxed space-y-2">
              <div>C&nbsp;= weighted log-average of 9 signals &nbsp;→ [0..1]</div>
              <div>G&nbsp;= penalty factors, multiplied &nbsp;&nbsp;&nbsp;&nbsp;→ (0..1]</div>
              <div>M&nbsp;= 0.15 + 2.85·(C·G) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ [0.15..3]</div>
            </div>
            <P>
              <strong className="text-ink">C</strong> follows the shape of OpenSSF&apos;s Criticality Score: contributor
              count carries the most weight (3.0) and stars the least meaningful weight (1.0 of ~12.5 total), because
              stars are the easiest signal to fake. Commits, merged PRs, closed issues, releases, forks, age and
              recency make up the rest, each log-squashed and capped so nothing can run away.{' '}
              <strong className="text-ink">G</strong> multiplies penalties for farm signatures: the biggest is the
              audience ratio <Code>(stars + 5·watchers) / (forks + 0.2·mergedPRs)</Code> — farm repos are busy but
              nobody actually uses them — plus penalties for zero releases, zero code, being a fork, content-only
              topics (awesome/roadmap/tutorial/interview), a missing or CC-* license, and a heavy one (×0.1) for PRs
              into your own repo.
            </P>
            <P>Then each merged PR is scored, and repeat PRs into the same repo decay:</P>
            <div className="bg-ground border border-line rounded-2xl shadow-card p-5 mt-4 font-mono text-[13.5px] text-ink-mid leading-relaxed">
              PRScore = 10 · M<sup>0.75</sup> / (1 + 0.3·(k−1))
            </div>
            <P>
              <Code>k</Code> is which PR this is into that repo — the 2nd is worth 77% of the 1st, the 3rd 63%, the
              10th about 27%. Sustained work on one project still pays; the 74th PR into the same repo does not. The
              exponent 0.75 dampens repo prestige so a big-name project helps but never decides on its own. Finally,
              no single repo may contribute more than 40% of the uncapped total, and{' '}
              <strong className="text-ink">Score</strong> is the sum. Repos owned by a short list of curated orgs
              (Apache, Kubernetes, CNCF, …) never score below M = 1.5, so a young official project isn&apos;t punished
              for being new.
            </P>
            <P>
              A second, secondary number — <strong className="text-ink">Impact</strong> — is{' '}
              <Code>Score ÷ merged PRs</Code>, shown only once someone has 5+ merged PRs (below that, one lucky merge
              into a big repo would read as a perfect average). Individual PRs on a profile show the repo&apos;s
              first-PR value (<Code>10·M<sup>0.75</sup></Code>) as their Impact badge.
            </P>
            <Callout tone="warn">
              <strong>Why it changed:</strong> the previous formula (<Code>1 + log₁₀(stars + 3·forks + 1)</Code>)
              trusted forks — and farm repos accumulate forks mechanically, because every participant forks to open a
              PR. A repo with 2 stars and 60 farmed forks scored half of <Code>react</Code>. Full analysis and the
              measured numbers are in issue #4. Not implemented from that issue yet: the per-PR effort term E and
              dependency counts (its step 8), and the admin review queue for low-M repos (step 7).
            </Callout>
          </section>

          <section>
            <H2 id="spam">Spam & data integrity</H2>
            <P>
              Before a repo&apos;s PRs count toward anything, the repo has to clear a validity gate:
              not archived, not itself a fork, and not (audience ratio &lt; 0.15 with zero releases) — the signature
              of a pure farm target. Repos that fail are marked invalid in{' '}
              <Code>repo_cache_map</Code> and every PR into them is stripped out before it&apos;s ever displayed or
              scored — not just deprioritized.
            </P>
            <P>
              On top of that, admins can hand-flag individual PRs (obvious self-merges, low-effort submissions) which
              are excluded the same way, and can grant &quot;own-repo exceptions&quot; for cases where a student
              genuinely maintains their own legitimate project below the star threshold — an individually vetted
              override rather than lowering the bar for everyone.
            </P>
          </section>

          <section>
            <H2 id="refresh">Staying fresh</H2>
            <P>
              A Kubernetes CronJob hits <Code>POST /api/refresh/incremental</Code> every 15 minutes (protected by a
              shared <Code>x-cron-secret</Code> header, checked in middleware). But &quot;every 15 minutes&quot; is how
              often it <em>checks</em>, not how often data actually changes: each individual student&apos;s profile
              cache is only refreshed once it&apos;s 24 hours old. If nothing has crossed that threshold on a given
              tick, the job legitimately does nothing and returns success.
            </P>
            <P>
              That means the visible leaderboard can go a long stretch without moving, then update in a burst — this
              is normal, not a malfunction. Refresh work is spread across a pool of GitHub tokens (the app&apos;s own
              system token, plus one contributed by every student who has ever logged in via OAuth), processed in
              small round-robin batches so no single tick can exceed GitHub&apos;s Search API limit of 30
              requests/minute.
            </P>
          </section>

          <section>
            <H2 id="auth">Authentication</H2>
            <P>
              Student login is GitHub OAuth requesting only the <Code>read:user</Code> scope — enough to raise a
              logged-in visitor&apos;s personal rate limit for live refreshes, deliberately not enough to see private
              repositories. This is a conscious tradeoff: a broader <Code>repo</Code> scope would let the app see
              private contributions too, but that&apos;s a disproportionate trust ask for a leaderboard, and storing
              that kind of token long-term would be a real security liability if the KV store were ever compromised.
            </P>
            <P>
              For local development, setting <Code>GITHUB_CLIENT_ID=ADMIN</Code> skips the real OAuth flow entirely
              and logs you in using your own <Code>GITHUB_TOKEN</Code> — hard-blocked outside <Code>npm run dev</Code>,
              so it&apos;s dev-only by construction, not a bypassable flag.
            </P>
          </section>

          <section>
            <H2 id="admin">Admin system</H2>
            <P>
              A single shared password (cookie session, 8-hour expiry) gates <Code>/admin</Code>, which covers:
              reviewing the incoming join-request queue, browsing and flagging PRs, managing the tracked-student
              roster, granting own-repo exceptions, and maintaining the Hall of Fame (achievers) list — add, edit
              (multiple programs per person, e.g. GSoC one year and LFX the next), and remove.
            </P>
          </section>

          <section>
            <H2 id="deployment">Deployment</H2>
            <P>
              Merging to <Code>main</Code> does <strong className="text-ink">not</strong> automatically deploy
              anything. Shipping a change is two deliberate steps: build and push a new Docker image to the registry,
              then tell the cluster to actually pull it (<Code>kubectl set image</Code> +{' '}
              <Code>rollout status</Code>). If something goes out broken,{' '}
              <Code>kubectl rollout undo</Code> reverts to the previous image immediately.
            </P>
            <P>
              The refresh CronJob runs natively inside Kubernetes rather than as a GitHub Actions scheduled workflow —
              GitHub Actions&apos; own cron trigger never reliably fires for this specific repo (most likely an
              org-level policy restricting scheduled runs), even though the workflow itself is valid and manual
              triggers work fine. The in-cluster CronJob has no dependency on GitHub Actions at all, and also talks to
              the app over the internal cluster network rather than the public hostname — sidestepping the tunnel&apos;s
              proxy timeout entirely.
            </P>
          </section>

          <section>
            <H2 id="local-dev">Local development</H2>
            <P>
              Two shortcuts make local setup need zero external accounts: leaving{' '}
              <Code>KV_REST_API_URL</Code>/<Code>KV_REST_API_TOKEN</Code> blank falls back to storing everything as
              JSON files on disk, and <Code>GITHUB_CLIENT_ID=ADMIN</Code> replaces real OAuth with your own token.
              With those, only a GitHub Personal Access Token is required — no special scopes.
            </P>
            <P>
              A fresh clone&apos;s leaderboard starts empty (every student renders as a zero-PR placeholder) because
              there&apos;s no cached GitHub data sitting locally yet. Running <Code>npm run bootstrap-data</Code>{' '}
              repeatedly calls the same incremental-refresh endpoint the production CronJob uses, populating real data
              a batch at a time into your own local (or personal Upstash) store — never touching production, no
              shared credentials involved.
            </P>
          </section>

          <section>
            <H2 id="tradeoffs">Known tradeoffs</H2>
            <ul className="mt-3 space-y-3">
              <li className="text-[15px] text-ink-mid leading-[1.7]">
                <strong className="text-ink">Single point of failure.</strong> One physical node, one tunnel process
                carrying both the site and SSH access. There is currently no independent fallback path if{' '}
                <Code>cloudflared</Code> itself goes down — this has happened in production.
              </li>
              <li className="text-[15px] text-ink-mid leading-[1.7]">
                <strong className="text-ink">The ranking formula rewards fork volume.</strong> Documented above under
                &quot;The ranking formula&quot; — a real, currently-live weakness, not yet fixed.
              </li>
              <li className="text-[15px] text-ink-mid leading-[1.7]">
                <strong className="text-ink">24-hour staleness means lumpy updates.</strong> Expected behavior, not a
                bug — see &quot;Staying fresh&quot; above.
              </li>
              <li className="text-[15px] text-ink-mid leading-[1.7]">
                <strong className="text-ink">The repo validity gate is a single, low bar.</strong> <Code>stars ≥ 5</Code>{' '}
                is easy to clear deliberately (e.g. by a small group starring each other&apos;s repos), and is the
                same underlying weakness as the ranking formula.
              </li>
            </ul>
          </section>

        </div>
      </div>
    </main>
  );
}
