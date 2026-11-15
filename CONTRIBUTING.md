# Contributing to Opensource Tracker NST

Thanks for helping out! This guide covers everything you need to run the project locally, test a change, and open a pull request. For what the product is and where it's deployed, see the [README](./README.md).

For deep implementation detail (every page, every API route, the caching design, known gotchas), see [DOCUMENTATION.md](./DOCUMENTATION.md). For the mechanics behind the platform — rate limits, why tokens matter, login vs. guest, the full request lifecycle — see [HOW_IT_WORKS.md](./HOW_IT_WORKS.md).

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

### Seeing real data (the leaderboard fills itself in)

A fresh clone has no GitHub data cached yet, so `/contributors` starts as a list of zero-PR placeholders. You do not have to do anything about it: under `npm run dev` the app runs the same incremental refresh the production CronJob runs, in the background, fast while profiles are missing and slowly once they are fresh, and the contributors page shows a progress bar and re-renders itself as data lands (`lib/local-auto-refresh.ts`, `app/contributors/BootstrapBanner.tsx`). With your `GITHUB_TOKEN` set this takes a few minutes for the first few hundred students; without one GitHub allows 60 anonymous requests an hour, so set the token.

`npm run bootstrap-data` still exists if you want to force a burst of refreshes (it needs `CRON_SECRET` in `.env.local`), and `LOCAL_AUTO_REFRESH=0` turns the background loop off. Running the production build locally (`npm start`, or the Docker image) needs `LOCAL_AUTO_REFRESH=1` to opt in, because in production the cluster's CronJob does this job.

Everything is written to your own disk-fallback storage (or your own Upstash database, if you set one up) — never to production data. Each checkout fills in independently; `.env.local` and `data/kv/` are gitignored.

## Environment variables reference

| Variable | Needed locally? | What it's for |
|---|---|---|
| `GITHUB_TOKEN` | Yes | Raises the GitHub Search/REST API rate limit. Any token works, no scopes required. |
| `ADMIN_PASSWORD` | Only if testing `/admin` | Gates the admin dashboard. Pick anything for local dev. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | No (use `ADMIN` shortcut) | Real GitHub OAuth App credentials, for the actual "Sign in with GitHub" flow. |
| `CRON_SECRET` | Only for `npm run bootstrap-data` (the background loop needs none) | Shared secret the refresh trigger sends as `x-cron-secret`. Pick any string for local dev — see "Seeing real data" above. |
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
4. Someone reviews and merges. Merging does **not** auto-deploy (see "What's deployed, and where" in the [README](./README.md)) — deploying is a separate, deliberate step someone takes afterward.

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

- **[DOCUMENTATION.md](./DOCUMENTATION.md)** — the complete technical reference. Read this before making any non-trivial change.
- **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** — GitHub rate limits, tokens, login vs. guest, and the request lifecycle.
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — step-by-step Kubernetes/Rancher deployment walkthrough.
