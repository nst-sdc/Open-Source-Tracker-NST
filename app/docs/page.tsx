import Link from 'next/link';

export const metadata = {
  title: 'Docs — Opensource Tracker NST',
  description: 'Architecture, key decisions, database design, environment variables, and production deployments for the Opensource Tracker NST platform.',
};

const techStack = [
  { layer: 'Framework', choice: 'Next.js 16 (App Router, Turbopack)', reason: 'Server Components for fast TTFB; built-in ISR' },
  { layer: 'Language', choice: 'TypeScript', reason: 'Type safety for GitHub API shapes and data transforms' },
  { layer: 'Styling', choice: 'TailwindCSS v4', reason: 'Utility-first rapid UI' },
  { layer: 'Caching', choice: 'Upstash Redis (REST API) + disk fallback', reason: 'Serverless-compatible, avoids GitHub rate limits' },
  { layer: 'Deployment', choice: 'Vercel (production) + Kubernetes (NST SDC cluster)', reason: 'Two independent, parallel deployment targets — same codebase' },
  { layer: 'Scheduling', choice: 'GitHub Actions (15-min incremental refresh cron)', reason: 'Keeps cached leaderboard data current without live GitHub calls on every page view' },
];

const principles = [
  { title: 'Cache-First, API-Second', desc: 'Every page reads from the KV cache first. Only a background refresh job (or explicit manual refresh) calls the GitHub API — this is the single constraint everything else is designed around, since GitHub\'s Search API allows just 30 requests/minute per token.' },
  { title: 'Server Components by Default', desc: 'Almost everything is a React Server Component. Client Components are used only when browser APIs are genuinely needed (clipboard, router, local state).' },
  { title: 'Zero-Dependency KV Client', desc: 'lib/kv.ts talks to Upstash Redis via raw HTTP REST calls — no npm SDK dependency.' },
  { title: 'Transparent Local Dev Fallback', desc: 'When KV_REST_API_URL/TOKEN are absent, the KV layer automatically falls back to reading/writing JSON files in data/kv/. No Redis account needed for local development.' },
  { title: 'KV Is the Source of Truth, Not the Committed JSON', desc: 'data/students.json, data/events.json, etc. are one-time seed files, read only if the corresponding KV key has never been set. Editing them after KV is populated has no effect on a live deployment.' },
];

const decisions = [
  {
    tag: 'Deployment strategy',
    color: 'purple',
    title: 'Two deployments, one codebase',
    body: 'The production Vercel deployment stays untouched. A separate copy repository was created for the NST SDC Kubernetes cluster, so the two can be developed, tested, and iterated on completely independently. No application code differs between them — only deployment-shaped files (Dockerfile, k8s/ manifests, CI workflow) exist in the K8s copy but not the original.',
  },
  {
    tag: 'Data isolation',
    color: 'blue',
    title: 'A separate Upstash database for the K8s deployment',
    body: 'The Kubernetes deployment uses its own, independent Upstash Redis instance rather than sharing production\'s database. This means students can deploy, break things, and experiment freely on the cluster without any risk to the real leaderboard\'s data.',
  },
  {
    tag: 'CI/registry',
    color: 'blue',
    title: 'GHCR over the cluster\'s local registry',
    body: 'The NST SDC cluster has its own unauthenticated local registry (nst-n1:30500), but it\'s only reachable from machines already on/SSH\'d into the cluster — not from GitHub-hosted Actions runners. GitHub Container Registry works out of the box from Actions with zero new secrets (the built-in GITHUB_TOKEN is enough), which is why CI pushes there instead.',
  },
  {
    tag: 'Deploy workflow',
    color: 'purple',
    title: 'Manual kubectl now, Fleet GitOps later',
    body: 'The cluster runs Fleet (Rancher\'s GitOps engine), which could auto-apply k8s/ manifests on every push. That was deliberately deferred: a first-time deploy already introduces a lot of new concepts (namespaces, Secrets, Ingress, Traefik), and adding GitOps on day one risks overloading a first-time deployer. Manual kubectl apply first, Fleet as a defined next step once the manual path is proven.',
  },
  {
    tag: 'Access method',
    color: 'blue',
    title: 'Rancher\'s browser kubectl shell over SSH/kubeconfig',
    body: 'Rancher\'s UI has a browser-based terminal, already authenticated as the logged-in user, running inside the cluster. This avoids needing SSH access, a downloaded kubeconfig, or a local kubectl install — much lower setup cost for a student\'s very first deploy.',
  },
  {
    tag: 'Real incident, fixed',
    color: 'red',
    title: 'CPU throttling from an undersized limit',
    body: 'The first real Kubernetes deploy measured 2–5 second page loads. Checking the container\'s cgroup stats (cat /sys/fs/cgroup/cpu.stat) showed throttled_usec (13.5s) actually exceeding usage_usec (11.4s) — the pod spent more time paused than running, because the original 500m (half a core) CPU limit was too low for rendering the ~1,900-student leaderboard. Raised to 1000m (one full core), which cut the throttled/usage ratio from ~119% to ~19%.',
  },
  {
    tag: 'Refresh architecture',
    color: 'purple',
    title: 'Wall-clock deadline, not a time estimate, bounds each refresh tick',
    body: 'The incremental refresh job auto-scales its batch size by however many GitHub tokens are currently available, splitting work across them concurrently. An earlier version tried to estimate "time per student" to size the batch safely — this hit FUNCTION_INVOCATION_TIMEOUT in production because a single student\'s repo-validation cost is unpredictable. It now uses a hard wall-clock cutoff (TICK_DEADLINE_MS) instead: whatever isn\'t finished in time simply stays stale for the next tick.',
  },
  {
    tag: 'Integrity',
    color: 'red',
    title: 'A strict 5-star repo threshold for anti-spam',
    body: 'Merged PRs into repositories with fewer than 5 GitHub stars are automatically penalized in the ranking score. This is a deliberate, strict choice to keep the leaderboard reflecting genuine open-source contributions rather than PRs into throwaway repos created purely to farm a count.',
  },
  {
    tag: 'Discovered mid-project',
    color: 'red',
    title: 'GitHub OAuth login was never actually configured — even in production',
    body: 'Investigating why the leaderboard\'s refresh cycle takes as long as it does surfaced that GITHUB_CLIENT_ID/SECRET are empty strings in production too — "Sign in with GitHub" has been silently returning a config error on the live site the whole time. This matters beyond login convenience: the token-pool refresh system was specifically designed to speed up automatically as real students log in and contribute their own tokens. With the pool always empty, every deployment has been running at the system\'s slowest tier (a single fallback token, ~16 hours for a full roster refresh) without anyone realizing it.',
  },
];

const envVars = [
  { name: 'GITHUB_TOKEN', required: 'Recommended', desc: 'A GitHub Personal Access Token. Raises the Search/REST API rate limit far above the unauthenticated ceiling. No special scopes needed for public repo search.' },
  { name: 'ADMIN_PASSWORD', required: 'Yes, for /admin', desc: 'Password gating the admin dashboard and all /api/admin/* routes.' },
  { name: 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET', required: 'Yes, for OAuth login', desc: 'A registered GitHub OAuth App\'s credentials. Locally, setting GITHUB_CLIENT_ID=ADMIN bypasses real OAuth entirely and logs you in with your own GITHUB_TOKEN — dev-only, hard-blocked when NODE_ENV=production.' },
  { name: 'CRON_SECRET', required: 'Yes, for incremental refresh', desc: 'Shared secret checked against the x-cron-secret header sent by the refresh workflows.' },
  { name: 'KV_REST_API_URL / KV_REST_API_TOKEN / KV_REST_API_READ_ONLY_TOKEN', required: 'Yes, in production', desc: 'Upstash Redis REST endpoint + tokens. Leave all three blank locally to use the automatic disk-based fallback instead — zero Redis account needed for local dev.' },
];

const deploySteps = [
  {
    n: '0',
    title: 'Before you start',
    body: 'You need a Rancher account on rancher.nstsdc.org and a GitHub account with push access to the K8s copy repo. No SSH access, no downloaded kubeconfig, no local kubectl install — Rancher\'s web UI has a browser-based terminal already authenticated as you.',
  },
  {
    n: '1',
    title: 'Create your own Upstash Redis database',
    body: 'Sign up at upstash.com (free tier), create a Redis database, and copy its REST URL, REST Token, and Read-Only REST Token. This must be your own instance — never the production database — so you can experiment freely without any risk to the live leaderboard.',
  },
  {
    n: '2',
    title: 'Register a GitHub OAuth App (optional)',
    body: 'Powers "Sign in with GitHub". Skippable at first — the app works fully without it. If you do this: Homepage URL https://oss-tracker.nstsdc.org, callback URL https://oss-tracker.nstsdc.org/api/auth/github/callback.',
  },
  {
    n: '3',
    title: 'Let CI build the image',
    body: 'Nothing to do except push to main — the repo\'s build-and-push.yml workflow already builds the Docker image and pushes it to GHCR using GitHub\'s built-in token. Make the GHCR package public (Package settings → Change visibility) — simplest, and safe since no secrets are baked into the image.',
  },
  {
    n: '4',
    title: 'Open the Rancher kubectl shell',
    body: 'On rancher.nstsdc.org, open the "local" cluster, then click the small terminal icon (>_) in the top-right corner. This opens a real terminal, already authenticated as you, running inside the cluster. Every command below gets pasted into that shell.',
  },
  {
    n: '5',
    title: 'Create the namespace',
    body: 'This repo is public, so manifests can be applied directly from GitHub — no need to clone it onto the cluster.',
    code: `kubectl apply -f https://raw.githubusercontent.com/saiudayagiri/OpenSource_NST_Tracker-k8s/main/k8s/00-namespace.yaml`,
  },
  {
    n: '6',
    title: 'Create the real Secret',
    body: 'Fill in your own values from steps 1–2 and 3, then paste this as one single line (the web terminal can mangle multi-line pastes with backslash continuations — press Ctrl+C to cancel and retry if a paste seems to hang).',
    code: `kubectl create secret generic opensource-tracker-secrets --namespace=opensource-tracker --from-literal=GITHUB_TOKEN="<your GitHub PAT>" --from-literal=ADMIN_PASSWORD="<pick anything>" --from-literal=GITHUB_CLIENT_ID="<from step 2, or leave empty>" --from-literal=GITHUB_CLIENT_SECRET="<from step 2, or leave empty>" --from-literal=CRON_SECRET="<any random string>" --from-literal=KV_REST_API_URL="<from step 1>" --from-literal=KV_REST_API_TOKEN="<from step 1>" --from-literal=KV_REST_API_READ_ONLY_TOKEN="<from step 1>"`,
  },
  {
    n: '7',
    title: 'Apply the Deployment, Service, and Ingress',
    body: 'Before applying the Ingress, run `kubectl get ingress -A` and confirm oss-tracker.nstsdc.org isn\'t already claimed by someone else\'s app on this shared cluster.',
    code: `kubectl apply -f https://raw.githubusercontent.com/saiudayagiri/OpenSource_NST_Tracker-k8s/main/k8s/02-deployment.yaml
kubectl apply -f https://raw.githubusercontent.com/saiudayagiri/OpenSource_NST_Tracker-k8s/main/k8s/03-service.yaml
kubectl apply -f https://raw.githubusercontent.com/saiudayagiri/OpenSource_NST_Tracker-k8s/main/k8s/04-ingress.yaml`,
  },
  {
    n: '8',
    title: 'Verify',
    body: 'Wait for the pod to show Running and 1/1 Ready, then try the real URL directly — the Cloudflare Tunnel routing is already live cluster-wide, no DNS/cert step to wait on.',
    code: `kubectl -n opensource-tracker get pods
curl -i https://oss-tracker.nstsdc.org/api/health`,
  },
  {
    n: '9',
    title: 'Wire up the incremental refresh cron',
    body: 'The leaderboard only updates when something calls /api/refresh/incremental. In the K8s repo\'s GitHub Settings → Secrets and variables → Actions, add APP_URL (your hostname) and CRON_SECRET (matching what you used in step 6). Never share a GitHub token between this cron and production\'s — both run every 15 minutes and would compete for the same rate limit.',
  },
  {
    n: '10',
    title: 'Tearing it down',
    body: 'Everything lives inside the opensource-tracker namespace, so removing it all is one command — fully reversible, redoing the walkthrough from step 4 brings it right back.',
    code: `kubectl delete namespace opensource-tracker`,
  },
];

const gotchas = [
  { title: 'The refresh backlog is real, and by design', body: 'With only the single fallback GitHub token in the pool (the current state, since OAuth login has never actually populated it), a full refresh cycle across the roster takes on the order of 16 hours. This scales down roughly proportionally as real students log in and contribute tokens — it\'s a capacity tradeoff, not a bug to silence.' },
  { title: 'A zero-stat leaderboard card doesn\'t mean zero contributions', body: 'If a student has never been successfully refreshed, their card shows an all-zero placeholder — indistinguishable from a genuine zero without checking the profile cache directly.' },
  { title: 'Two cache layers can disagree temporarily', body: 'A student\'s profile page can show fresher data than their leaderboard card, or vice versa, because the per-student cache and the leaderboard summary cache update on different schedules. Expected, not a bug.' },
  { title: 'GitHub\'s Search API rejects multi-author OR queries', body: 'A query like author:a OR author:b returns 422 Validation Failed, contradicting GitHub\'s own documented operator limits — verified empirically. Don\'t reintroduce batched multi-author search without re-checking this first.' },
  { title: 'The large summary-cache blob is a known structural cost', body: 'Every tracked student\'s summary lives in one JSON blob per time period (~3MB at current roster size) — even a 5-entry home page preview fetches and parses the entire thing. This is the same cost on both Vercel and Kubernetes; it\'s just more visible under a tighter CPU limit.' },
];

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    purple: 'text-purple-400 border-purple-500/20 bg-purple-500/5',
    blue: 'text-blue-400 border-blue-500/20 bg-blue-500/5',
    red: 'text-red-400 border-red-500/20 bg-red-500/5',
  };
  return (
    <span className={`inline-block text-[10px] uppercase font-mono tracking-widest px-2.5 py-1 rounded border ${styles[color]}`}>
      {children}
    </span>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#030712] text-white relative">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Hero */}
      <div className="relative overflow-hidden pt-20 pb-16 px-4 border-b border-white/[0.04]">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full bg-purple-600/10 blur-[120px]" />
          <div className="absolute top-0 right-1/4 w-[500px] h-[350px] rounded-full bg-blue-600/8 blur-[120px]" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="flex justify-start mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/35 hover:text-white/60 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/25 rounded-full px-4 py-1.5 text-xs font-semibold text-purple-400 mb-6">
            📚 Technical Reference
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 tracking-tight leading-none">
            Platform{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400">
              Docs
            </span>
          </h1>
          <p className="text-white/55 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Architecture, real decisions and why they were made, the database design, environment variables, and both production deployments — kept current, not aspirational.
          </p>

          <div className="flex flex-wrap gap-2.5 justify-center mt-10">
            <a href="#architecture" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">🏗️ Architecture</a>
            <a href="#decisions" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">🧭 Decision Log</a>
            <a href="#database" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">🗄️ Database</a>
            <a href="#env" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">🔑 Env Vars</a>
            <a href="#production" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">🚀 Production</a>
            <a href="#deploy" className="text-xs px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 transition-all">⎈ Deploy to Rancher</a>
            <a href="#gotchas" className="text-xs px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-all">⚠️ Gotchas</a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-20 space-y-24">

        {/* Overview */}
        <section className="space-y-6">
          <div className="bg-white/[0.015] border border-white/[0.05] rounded-3xl p-8 backdrop-blur-sm">
            <p className="text-white/60 leading-relaxed text-sm md:text-base">
              <strong>Opensource Tracker NST</strong> is a leaderboard and visibility platform tracking open source contributions made by NST students across three campuses (Rishihood, ADYPU, SVYASA). It fetches pull requests and issues from the GitHub Search API, ranks students by clean merged PRs, and surfaces this data on a public dashboard — with an admin system and automatic repo-validation layer to keep out fake, low-quality, or spam contributions.
            </p>
            <p className="text-white/45 leading-relaxed text-sm mt-4">
              It does not gate any public page behind login, does not write to GitHub on a student&apos;s behalf, and is not a repository management tool.
            </p>
          </div>
        </section>

        {/* Architecture */}
        <section id="architecture" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge color="purple">Tech stack &amp; design</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Architecture</h2>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-white/40 text-xs uppercase tracking-wider font-mono">
                  <th className="px-5 py-3">Layer</th>
                  <th className="px-5 py-3">Choice</th>
                  <th className="px-5 py-3 hidden md:table-cell">Reason</th>
                </tr>
              </thead>
              <tbody>
                {techStack.map((row) => (
                  <tr key={row.layer} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-5 py-3 text-white/80 font-medium whitespace-nowrap">{row.layer}</td>
                    <td className="px-5 py-3 text-purple-400/90">{row.choice}</td>
                    <td className="px-5 py-3 text-white/40 hidden md:table-cell">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {principles.map((p) => (
              <div key={p.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5 hover:border-purple-500/20 hover:bg-white/[0.03] transition-all">
                <h4 className="font-semibold text-white/90 text-sm mb-1.5">{p.title}</h4>
                <p className="text-white/45 text-xs leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-6 overflow-x-auto">
            <div className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-4">Two deployment targets, same codebase</div>
            <pre className="text-[11px] leading-relaxed text-white/50 font-mono whitespace-pre">{`Vercel (production)                    Kubernetes (NST SDC cluster)
──────────────────                    ────────────────────────────
git push → Vercel build                git push → GHCR image build
  → serverless functions                 → kubectl apply (manual, for now)
  → Vercel KV / Upstash                  → Deployment + own Upstash DB
  → *.vercel.app (automatic HTTPS)       → Ingress + Cloudflare Tunnel
                                            → *.nstsdc.org (automatic HTTPS)`}</pre>
          </div>
        </section>

        {/* Decision Log */}
        <section id="decisions" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge color="blue">Why, not just what</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Decision Log</h2>
            <p className="text-white/40 text-sm">Real decisions made on this project, and the reasoning behind each — including ones discovered mid-way, not just planned upfront.</p>
          </div>

          <div className="space-y-4">
            {decisions.map((d) => (
              <div key={d.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6 hover:bg-white/[0.025] transition-all">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h3 className="font-bold text-white/90 text-base leading-snug">{d.title}</h3>
                  <Badge color={d.color}>{d.tag}</Badge>
                </div>
                <p className="text-white/50 text-sm leading-relaxed">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Database & Caching */}
        <section id="database" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge color="purple">KV layer</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Database &amp; Caching</h2>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-6 space-y-4">
            <p className="text-white/55 text-sm leading-relaxed">
              <code className="text-purple-400 text-xs bg-black/30 px-1.5 py-0.5 rounded">lib/kv.ts</code> talks to Upstash Redis via raw HTTPS REST calls. If <code className="text-purple-400 text-xs bg-black/30 px-1.5 py-0.5 rounded">KV_REST_API_URL</code>/<code className="text-purple-400 text-xs bg-black/30 px-1.5 py-0.5 rounded">TOKEN</code> are absent, it transparently falls back to JSON files under <code className="text-purple-400 text-xs bg-black/30 px-1.5 py-0.5 rounded">data/kv/</code> — no code branching needed to develop locally without a Redis account.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-blue-400 text-xs font-semibold uppercase tracking-wide mb-1.5">Profile cache</div>
                <div className="text-white/45 text-xs leading-relaxed">Key: <code className="text-white/60">profile_cache:&lt;username&gt;</code>. One entry per student — profile, PRs, issues. 30-day physical TTL, 24-hour staleness threshold for the incremental refresh.</div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-blue-400 text-xs font-semibold uppercase tracking-wide mb-1.5">Summary cache</div>
                <div className="text-white/45 text-xs leading-relaxed">Key: <code className="text-white/60">summary_cache:&lt;period&gt;</code>. One ~3MB blob per time period holding <strong>every</strong> tracked student — no expiry, patched incrementally so the leaderboard never drops to zero.</div>
              </div>
            </div>
            <div className="rounded-xl border border-red-500/15 bg-red-500/[0.03] p-4">
              <div className="text-red-400 text-xs font-semibold uppercase tracking-wide mb-1.5">Known structural cost</div>
              <div className="text-white/45 text-xs leading-relaxed">Because the summary cache is one blob per period, patching a single student&apos;s entry means reading and rewriting the entire ~1,900-entry array — and even a 5-entry home page preview must fetch and parse the whole thing. This is the biggest structural inefficiency in the codebase today; worth revisiting if the roster grows much further.</div>
            </div>
            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4">
              <div className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-1.5">Repo validation (anti-spam)</div>
              <div className="text-white/45 text-xs leading-relaxed">Every repo a merged PR points to is checked once for star count and cached permanently in <code className="text-white/60">repo_cache_map</code>. Fewer than 5 stars → penalized in the ranking score, catching the common &quot;spam PR into a throwaway repo&quot; pattern automatically.</div>
            </div>
          </div>
        </section>

        {/* Environment Variables */}
        <section id="env" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge color="blue">Configuration</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Environment Variables</h2>
            <p className="text-white/40 text-sm">The full <code className="text-white/50">.env.example</code> template lives in the repo — this is the same reference, with context.</p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] divide-y divide-white/[0.05]">
            {envVars.map((v) => (
              <div key={v.name} className="p-5">
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <code className="text-purple-400 text-xs font-mono bg-black/30 px-2 py-1 rounded">{v.name}</code>
                  <span className="text-[10px] text-white/40 font-mono uppercase tracking-wide">{v.required}</span>
                </div>
                <p className="text-white/45 text-xs leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Production Deployments */}
        <section id="production" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge color="purple">Live today</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Production Deployments</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">▲</span>
                <h3 className="font-bold text-white text-base">Vercel</h3>
              </div>
              <ul className="space-y-2 text-xs text-white/50">
                <li>Serverless functions, zero-config deploys on git push</li>
                <li>Vercel KV / Upstash integration for the production database</li>
                <li>GitHub Actions cron hits <code className="text-white/60">/api/refresh/incremental</code> every 15 minutes</li>
                <li>Automatic HTTPS on <code className="text-white/60">*.vercel.app</code></li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⎈</span>
                <h3 className="font-bold text-white text-base">NST SDC Kubernetes cluster</h3>
              </div>
              <ul className="space-y-2 text-xs text-white/50">
                <li>Dedicated <code className="text-white/60">opensource-tracker</code> namespace, isolated from every other student&apos;s app on the shared cluster</li>
                <li>Image built by CI and pushed to GHCR on every push to main</li>
                <li>Traefik Ingress + Cloudflare Tunnel gives automatic HTTPS on <code className="text-white/60">*.nstsdc.org</code> — zero DNS/cert config needed</li>
                <li>Node scheduling is fully automatic (bin-packed by Kubernetes across the cluster&apos;s nodes) — never manually pinned</li>
                <li>Own, separate Upstash database — isolated from production</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Deploy to Rancher */}
        <section id="deploy" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge color="blue">Step-by-step</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">How to Deploy to the NST SDC Cluster</h2>
            <p className="text-white/40 text-sm max-w-xl mx-auto">
              Taking the K8s copy repo from &quot;runs on my laptop&quot; to live at oss-tracker.nstsdc.org. No prior Kubernetes experience assumed — read this alongside Rancher&apos;s browser kubectl shell.
            </p>
          </div>

          <div className="relative border-l border-white/[0.08] ml-4 pl-8 space-y-10 py-2">
            {deploySteps.map((step) => (
              <div key={step.n} className="relative group">
                <div className="absolute -left-[42px] top-0 w-6 h-6 rounded-full bg-[#030712] border-2 border-emerald-400 flex items-center justify-center text-[10px] font-bold text-emerald-400" />
                <div className="space-y-2.5">
                  <h3 className="font-bold text-white/95 text-base flex items-center gap-2">
                    <span className="text-emerald-400/80 font-mono text-sm">Step {step.n}:</span> {step.title}
                  </h3>
                  <p className="text-white/50 text-xs md:text-sm leading-relaxed max-w-2xl">{step.body}</p>
                  {step.code && (
                    <pre className="bg-black/40 border border-emerald-500/15 rounded-xl px-4 py-3 text-[11px] text-emerald-300/90 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                      {step.code}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4 flex gap-3">
            <span className="text-blue-400 flex-shrink-0 text-base">💡</span>
            <div className="text-white/50 text-xs leading-relaxed">
              Every one of these steps was actually run once, end-to-end, before being written down here — including the CPU-throttling fix in the Decision Log above. For cluster-specific troubleshooting (Traefik, DNS, kubectl connectivity), the cluster&apos;s own <code className="text-white/60">nst-sdc/nst-cluster-docs</code> repo is the source of truth.
            </div>
          </div>
        </section>

        {/* Gotchas */}
        <section id="gotchas" className="space-y-6 scroll-mt-20">
          <div className="border border-red-500/15 bg-red-500/[0.015] rounded-3xl p-8 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-red-400">Known Behaviours &amp; Gotchas</h2>
            </div>
            <div className="space-y-3">
              {gotchas.map((g) => (
                <div key={g.title} className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                  <div className="font-semibold text-sm text-red-400/90 mb-1">{g.title}</div>
                  <div className="text-white/50 text-xs leading-relaxed">{g.body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Further reading */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.02] to-transparent p-8 md:p-10 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3 tracking-tight">Want the full detail?</h2>
          <p className="text-white/40 text-sm max-w-lg mx-auto mb-2 leading-relaxed">
            This page covers the deploy walkthrough in full, but the repository&apos;s markdown docs go even deeper — every page, every API route, and the full admin system.
          </p>
          <p className="text-white/30 text-xs max-w-lg mx-auto mb-8 leading-relaxed">
            <code className="text-white/50">DOCUMENTATION.md</code> · <code className="text-white/50">docs/ARCHITECTURE.md</code> · <code className="text-white/50">docs/DEPLOYMENT.md</code> — a GitHub repo link will be added here soon.
          </p>
          <div className="flex flex-wrap gap-3.5 justify-center">
            <Link href="/contributors" className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold shadow-lg shadow-purple-900/10 transition-all cursor-pointer">
              View Contributors
            </Link>
            <Link href="/get-started" className="px-6 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] text-white/80 text-sm font-semibold transition-all cursor-pointer">
              Get Started
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
