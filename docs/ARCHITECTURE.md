# Architecture

This document explains **how the app works**. If you're looking for **how to deploy it to the NST SDC cluster**, see [DEPLOYMENT.md](./DEPLOYMENT.md) instead. If you're looking for a deep, section-by-section technical reference (data layer, every API route, every page, admin system, gotchas), see [../DOCUMENTATION.md](../DOCUMENTATION.md) — this file is a shorter map that points into it.

## What this app is

A leaderboard that tracks NST students' open-source GitHub contributions: pulls PR/issue data from the GitHub Search API, ranks students by clean merged PRs, and shows it on a public dashboard. See `DOCUMENTATION.md` Section 1 for the full goals/non-goals.

## Two deployments, one codebase

This repo is a copy of the original app (still live on Vercel — that one is untouched). No application code differs between the two; the only things that exist in this repo but not the original are deployment-shaped files that Vercel simply doesn't look at:

- `Dockerfile`, `.dockerignore`
- `k8s/` manifests
- `.github/workflows/build-and-push.yml`
- `next.config.ts`'s `output: 'standalone'` line
- `app/api/health/route.ts`

Everything else — `app/`, `lib/`, the data model, the caching design — is the same system described in `DOCUMENTATION.md`, and applies equally to both deployments.

## Request flow (unchanged from the Vercel version)

```
Browser
   │
   ▼
Next.js App Router (Server Components by default)
   │
   ▼
lib/kv.ts  →  KV_REST_API_URL/TOKEN set?
                 YES → Upstash Redis (REST API)
                 NO  → data/kv/*.json on disk
   │
   ▼ (only on cache miss / stale / manual refresh)
GitHub Search + REST APIs (lib/github.ts)
```

Full detail on caching layers, TTLs, and the auto-scaling incremental refresh job: `DOCUMENTATION.md` Section 5.

## Deployment topology: Vercel (original)

```
GitHub push → Vercel build → Vercel serverless functions
                                     │
                                     ▼
                          Upstash Redis (Vercel KV integration)

GitHub Actions (refresh-cache.yml, every 15 min)
   → POST https://opensource-nst-tracker.vercel.app/api/refresh/incremental
```

Zero-config: connect the repo to Vercel, set env vars, done. See `DOCUMENTATION.md` Section 12.

## Deployment topology: this repo (NST SDC K8s cluster)

```
GitHub push to main
   │
   ▼
.github/workflows/build-and-push.yml
   → docker build (multi-stage, next.config.ts output:'standalone')
   → push image to ghcr.io/nst-sdc/open-source-tracker-nst:latest
     (currently fails: org Actions "Workflow permissions" are locked
      read-only, blocking the push — needs an org owner to fix. Until
      then this step is done manually: docker build + docker push.)
                                     │
                                     ▼ (manual either way, see DEPLOYMENT.md)
                kubectl apply -f k8s/  (via Rancher's browser-based kubectl shell)
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                  ▼
        Deployment (opensource-tracker)      Secret (opensource-tracker-secrets)
        1 pod, health-probed on /api/health   GITHUB_TOKEN, ADMIN_PASSWORD,
        imagePullSecrets: ghcr-pull-secret    GITHUB_CLIENT_ID/SECRET, CRON_SECRET,
        (package is currently private)        KV_REST_API_URL/TOKEN(_READ_ONLY)
                    │                          
                    ▼                          
        Service (ClusterIP, port 80→3000)
                    │
                    ▼
        Ingress (traefik, host oss-tracker.nstsdc.org)
                    │
                    ▼
        Cloudflare Tunnel + wildcard *.nstsdc.org DNS
        (already configured cluster-wide — zero cert/DNS work per app)
                    │
                    ▼
              https://oss-tracker.nstsdc.org

k8s/05-refresh-cronjob.yaml  (native K8s CronJob, every 15 min)
   → POST http://opensource-tracker/api/refresh/incremental (in-cluster Service, not the public hostname)
   (NOT GitHub Actions — its scheduled trigger never fires on this repo, see DOCUMENTATION.md §12)
```

Key differences from Vercel, explained:

| Aspect | Vercel | This repo (K8s) |
|---|---|---|
| Build | Vercel's own pipeline | Docker multi-stage build (`Dockerfile`) → GHCR (currently manual — see above) |
| Runtime | Serverless functions | A single long-running Node process (`node server.js`, the Next.js standalone output) in one pod |
| Public HTTPS | Automatic (`*.vercel.app`) | Ingress + Cloudflare Tunnel (`*.nstsdc.org`), automatic once the Ingress exists |
| Deploy trigger | Git push (automatic) | Fully manual right now: build+push the image, then `kubectl apply`/`kubectl rollout restart` — see DEPLOYMENT.md's closing section on the Fleet/GitOps upgrade path |
| Refresh scheduling | GitHub Actions cron (works) | Kubernetes CronJob (works) — GitHub Actions' own scheduled trigger doesn't fire on this repo |
| Data store | Vercel's Upstash KV integration (production data) | Your **own, separate** Upstash Redis instance — see DEPLOYMENT.md. Never point this at the production database. |
| Health check | N/A (serverless) | `GET /api/health` → `{"ok":true}`, used by the Deployment's liveness/readiness probes |
| Own-repo PR scoring | Same feature, same code | Same feature, same code — admin-curated allowlist, see DOCUMENTATION.md §6.2 |

### Why a Secret, not NST Init

The cluster's self-service "NST Init" deploy tool is the easiest path for most student apps, but its automation doesn't have permission to create Kubernetes Secrets — and this app can't run without several (`GITHUB_TOKEN`, `KV_REST_API_URL/TOKEN`, etc.). That's why this repo ships real `k8s/*.yaml` manifests applied via `kubectl` instead. See DEPLOYMENT.md for the exact steps.

### Why GHCR, not the cluster's local registry

The cluster has its own unauthenticated registry (`nst-n1:30500`), but it's only reachable from machines already on/SSH'd into the cluster — not from GitHub-hosted Actions runners. GHCR (`ghcr.io`) works out of the box from GitHub Actions with zero new secrets (the built-in `GITHUB_TOKEN` is enough to push), which is why the CI workflow targets it instead.
