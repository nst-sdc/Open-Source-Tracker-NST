# Opensource Tracker NST

A leaderboard that tracks NST students' open-source GitHub contributions — pulls pull requests and issues from the GitHub Search API, ranks students by clean merged PRs, and shows it all on a public dashboard. Built to encourage real open-source contribution, with an admin system and automatic spam filtering to keep the leaderboard honest.

This document explains what the project is and where it runs. Want to run it locally or contribute a change? See **[CONTRIBUTING.md](./CONTRIBUTING.md)**. For deep implementation detail (every page, every API route, the caching design, known gotchas), see [DOCUMENTATION.md](./DOCUMENTATION.md). For how the platform actually works under the hood — rate limits, why tokens matter, login vs. guest, the full request lifecycle, with a schematic — see [HOW_IT_WORKS.md](./HOW_IT_WORKS.md).

## What's deployed, and where

This exact codebase runs in two independent places:

| | NST SDC Kubernetes cluster |
|---|---|
| **URL** | `oss-tracker.nstsdc.org` |
| **Owner repo** |  `nst-sdc/Open-Source-Tracker-NST` |
| **Database** | Valkey inside the cluster, behind an Upstash-compatible REST proxy (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)) |
| **Refresh trigger** | A native Kubernetes CronJob (15 min) — GitHub Actions' own scheduled trigger doesn't fire on this repo (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)) |
| **Deploys on push?** | Yes — GitHub Actions builds the image and pins its tag in `k8s/`; Fleet applies it (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)) |

**Pushing to `main` deploys.** The "Build, push and roll out" workflow builds the image, pushes it, and commits the new tag into `k8s/02-deployment.yaml`; Fleet on the cluster applies that commit within a minute. To roll back, revert the `chore(deploy): roll out …` commit. To pause deploys during an incident, pause the Fleet GitRepo. Details, including the one-time setup, are in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Contributing

Contributions are welcome. Local setup, environment variables, testing, and the PR process all live in **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

## Further reading

- **[DOCUMENTATION.md](./DOCUMENTATION.md)** — the complete technical reference: every page, every API route, the caching architecture, the admin system, known gotchas. Read this before making any non-trivial change.
- **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** — the mechanics: GitHub rate limits, why tokens matter, login vs. guest, the full request lifecycle, with a schematic.
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — step-by-step Kubernetes/Rancher deployment walkthrough.
- **[docs/PROFILE-SOCIALS.md](./docs/PROFILE-SOCIALS.md)** — the Connect card on contributor pages, where students add their own contact links.

## License

This project is licensed under the [GNU General Public License v3.0](./LICENSE).
