# Opensource Tracker NST

A leaderboard that tracks NST students' open-source GitHub contributions — pulls pull requests and issues from the GitHub Search API, ranks students by clean merged PRs, and shows it all on a public dashboard. Built to encourage real open-source contribution, with an admin system and automatic spam filtering to keep the leaderboard honest.

This document covers everything you need to run the project locally, understand what's deployed where, and contribute a change. For deep implementation detail (every page, every API route, the caching design, known gotchas), see [DOCUMENTATION.md](./DOCUMENTATION.md). For how the platform actually works under the hood — rate limits, why tokens matter, login vs. guest, the full request lifecycle, with a schematic — see [HOW_IT_WORKS.md](./HOW_IT_WORKS.md).

## What's deployed, and where

This exact codebase runs in two independent places:

| | NST SDC Kubernetes cluster |
|---|---|
| **URL** | `oss-tracker.nstsdc.org` |
| **Owner repo** |  `nst-sdc/Open-Source-Tracker-NST` |
| **Database** | A separate, dedicated Upstash Redis — never shared with production |
| **Refresh trigger** | A native Kubernetes CronJob (15 min) — GitHub Actions' own scheduled trigger doesn't fire on this repo (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)) |
| **Deploys on push?** | No — see below |

**Important: pushing to `main` in this repo does not automatically deploy.** Two separate steps are needed for a change to actually go live here:
1. Someone builds and pushes a new Docker image (normally automatic via `.github/workflows/build-and-push.yml`, but this currently requires manual `docker build`/`docker push` — see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for why and how).
2. Someone tells the cluster to actually pull it: `kubectl -n opensource-tracker rollout restart deployment/opensource-tracker`.

If something goes live and turns out to be broken, `kubectl rollout undo deployment/opensource-tracker` rolls back to the previous image immediately.

## Local setup

You do not need any production credentials, a Kubernetes cluster, or even a database account to run this locally. Two shortcuts, both already built into the app, make that true:

1. **No Redis/Upstash account needed.** Leave `KV_REST_API_URL`/`KV_REST_API_TOKEN` blank — the app automatically falls back to storing everything as JSON files under `data/kv/` (see `lib/kv.ts`). Full functionality, nothing to sign up for.
2. **No GitHub OAuth App needed.** Set `GITHUB_CLIENT_ID=ADMIN` — this skips the real OAuth flow and logs you in locally using your own `GITHUB_TOKEN` instead. Hard-blocked outside `npm run dev` (see `app/api/auth/github/route.ts`), so it's dev-only by design, not a security hole.

With those two shortcuts, the only thing you actually need is your own GitHub Personal Access Token.

```bash
git clone https://github.com/nst-sdc/Open-Source-Tracker-NST.git
cd Open-Source-Tracker-NST
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```bash
GITHUB_TOKEN=ghp_your_own_token_here   # https://github.com/settings/tokens — no special scopes needed
GITHUB_CLIENT_ID=ADMIN                 # the local-dev shortcut above
```

Leave everything else blank, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). See [.env.example](./.env.example) for what every variable does, including the ones you don't need locally.

**Note:** `npm run dev` shows recurring `FATAL: An unexpected Turbopack error` messages in the terminal — this is harmless (Server Components importing Node's `fs` module trigger it); pages still serve `200`. `npm run build`/`npm start` are unaffected.

## Environment variables reference

| Variable | Needed locally? | What it's for |
|---|---|---|
| `GITHUB_TOKEN` | Yes | Raises the GitHub Search/REST API rate limit. Any token works, no scopes required. |
| `ADMIN_PASSWORD` | Only if testing `/admin` | Gates the admin dashboard. Pick anything for local dev. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | No (use `ADMIN` shortcut) | Real GitHub OAuth App credentials, for the actual "Sign in with GitHub" flow. |
| `CRON_SECRET` | No | Shared secret the refresh trigger sends as `x-cron-secret`. Only matters if you're testing `/api/refresh/incremental` yourself. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `KV_REST_API_READ_ONLY_TOKEN` | No (disk fallback) | Upstash Redis REST credentials. If you do set these for local testing, use your **own** Upstash database — never point local dev at any shared/production one. |

## Experimenting and testing changes

- **Local dev is the actual sandbox.** With the two shortcuts above, nothing you do locally touches any shared data or credentials — break things freely.
- **Before pushing anything**, run:
  ```bash
  npm run build      # catches TypeScript + compilation errors — a broken build has silently blocked deployments before
  npx tsc --noEmit    # type-check only, faster iteration
  ```
- If you want to test against the actual Kubernetes deployment's behavior (not just Vercel-style local dev), [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) walks through deploying your own copy to the cluster, end to end, written for someone who's never used Rancher or Kubernetes before.

## How to raise a PR

1. Fork or branch, make your change.
2. Run `npm run build` — must pass before anything else.
3. Open a PR against `main` with a clear description of *why* the change is needed, not just what it does.
4. Someone reviews and merges. Merging does **not** auto-deploy (see "What's deployed, and where" above) — deploying is a separate, deliberate step someone takes afterward.

There's no gatekeeping beyond "the build passes and the reasoning is clear." If a step anywhere in these docs doesn't work as written, that's a docs bug worth fixing, not a sign you did something wrong.

## Project structure at a glance

```
app/            Next.js App Router — pages, components, API routes
lib/            Shared server-side logic (GitHub API, caching, KV storage)
data/           One-time seed JSON (NOT the live source of truth once KV is populated — see DOCUMENTATION.md §4)
k8s/            Kubernetes manifests for the NST SDC cluster deployment
docs/           Deployment walkthrough and architecture notes
.github/workflows/  CI (image build) + a legacy manual-trigger refresh workflow
```

## Further reading

- **[DOCUMENTATION.md](./DOCUMENTATION.md)** — the complete technical reference: every page, every API route, the caching architecture, the admin system, known gotchas. Read this before making any non-trivial change.
- **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** — the mechanics: GitHub rate limits, why tokens matter, login vs. guest, the full request lifecycle, with a schematic.
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — step-by-step Kubernetes/Rancher deployment walkthrough.
