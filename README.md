# Opensource Tracker NST

A leaderboard that tracks NST students' open-source GitHub contributions — pulls pull requests and issues from the GitHub Search API, ranks students by clean merged PRs, and shows it all on a public dashboard. Built to encourage real open-source contribution, with an admin system and automatic spam filtering to keep the leaderboard honest.

This document explains what the project is and where it runs. Want to run it locally or contribute a change? See **[CONTRIBUTING.md](./CONTRIBUTING.md)**. For deep implementation detail (every page, every API route, the caching design, known gotchas), see [DOCUMENTATION.md](./DOCUMENTATION.md). For how the platform actually works under the hood — rate limits, why tokens matter, login vs. guest, the full request lifecycle, with a schematic — see [HOW_IT_WORKS.md](./HOW_IT_WORKS.md).

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

## Contributing

Contributions are welcome. Local setup, environment variables, testing, and the PR process all live in **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

## Further reading

- **[DOCUMENTATION.md](./DOCUMENTATION.md)** — the complete technical reference: every page, every API route, the caching architecture, the admin system, known gotchas. Read this before making any non-trivial change.
- **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** — the mechanics: GitHub rate limits, why tokens matter, login vs. guest, the full request lifecycle, with a schematic.
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — step-by-step Kubernetes/Rancher deployment walkthrough.
