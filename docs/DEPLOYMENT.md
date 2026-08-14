# Deploying to the NST SDC Cluster

This is a step-by-step walkthrough for taking this repo from "runs on my laptop" to "live at `https://oss-tracker.nstsdc.org`". It assumes **no prior experience with this specific app** — just basic `git`/`docker`/`kubectl` familiarity.

If something here doesn't work exactly as written, that's useful information, not a sign you did something wrong — infrastructure docs go stale. Open an issue or ask in the SDC channels rather than guessing silently. Nothing you do in the steps below can affect the production Vercel deployment; they're completely separate systems.

## 0. Before you start

You'll need:

- **A Rancher account** on `rancher.nstsdc.org`. If you don't have this yet, that's the actual first step — ask in the SDC cluster access channel. The cluster's own docs (`nst-sdc/nst-cluster-docs`, `guide/access.md`) cover how this is granted.
- **A GitHub account** with permission to push to this repo (or your own fork of it).
- **Docker**, only if you want to test the build locally first (recommended, and covered in the local setup section of the [README](../README.md) — do that before touching the cluster at all).
- Five to ten minutes for a one-time [Upstash](https://upstash.com) signup (free tier) — this repo's database, separate from production.

You do **not** need SSH access, a downloaded kubeconfig, or `kubectl` installed on your own machine. Rancher's web UI has a browser-based terminal already authenticated as you — that's what every command below uses. You also do **not** need any of the production secrets from the Vercel deployment — every credential below is either something you generate yourself or a free account you create yourself.

**If you've never used Rancher/Kubernetes before:** a *cluster* is the whole group of machines ("nodes") Kubernetes manages; a *namespace* is a labeled folder inside it that keeps your app's resources separate from everyone else's; a *pod* is one running instance of your app's container. You don't need to know more than that to follow this guide.

## 1. Create your own Upstash Redis database

This deployment must use its **own** Redis instance, never the production one — that's what keeps students free to experiment (including breaking things) without any risk to the live leaderboard.

1. Sign up at [upstash.com](https://upstash.com) (free tier is enough).
2. Create a new Redis database — any region close to the cluster is fine.
3. From its dashboard, copy the **REST URL**, **REST Token**, and **Read-Only REST Token**. You'll paste these into the Kubernetes Secret in step 6.

## 2. Register a GitHub OAuth App (optional but recommended)

This powers the "Sign in with GitHub" button. Skippable at first — the app runs fine without it (see the README's local dev shortcuts) — but you'll want it for a real deployment eventually.

1. [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**.
2. Homepage URL: `https://oss-tracker.nstsdc.org`
3. Authorization callback URL: `https://oss-tracker.nstsdc.org/api/auth/github/callback`
4. Save the generated **Client ID** and **Client Secret** for step 6.

## 3. Let CI build the image

Nothing to do here except push to `main` — `.github/workflows/build-and-push.yml` already builds the Docker image and pushes it to `ghcr.io/<your-username>/<this-repo-name>:latest` on every push, using GitHub's built-in token. Check the **Actions** tab after your first push to confirm it went green, and check **Packages** on your GitHub profile to see the image.

**One thing to set once:** GHCR packages are private by default. Either:
- Make the package public (its **Package settings** → **Change visibility**) — simplest, fine for this project since it contains no secrets (they're injected at runtime, never baked into the image — see the Dockerfile's comments), or
- Keep it private and create a Kubernetes pull secret (step 7 covers this) — needed either way if you ever go private.

## 4. Open the Rancher kubectl shell

1. Go to `rancher.nstsdc.org`, find the **"local"** cluster in the cluster list (there may be more than one cluster listed — `local` is the shared one everyone deploys to), and click into it.
2. In the top-right corner of the cluster view, click the small terminal icon (`>_`). This opens a **Kubectl Shell** panel at the bottom of the page — a real terminal, already authenticated as you, running inside the cluster. No SSH, no downloaded kubeconfig, nothing to install.

Every command in the rest of this guide gets pasted into that shell.

**Tip:** this repo is public, so instead of cloning it onto the cluster, you can apply any manifest straight from GitHub with `kubectl apply -f https://raw.githubusercontent.com/<owner>/<repo>/main/k8s/<file>.yaml`. That's what every command below does, using this repo's actual path — if you're deploying from your own fork instead, swap in your fork's owner/repo.

**Tip:** the web terminal can mangle multi-line pastes (backslash line-continuations especially). If a paste seems to hang or shows an unexpected `>` prompt, press **Ctrl+C** to cancel and try again — prefer single-line commands where possible, which is why the Secret command below is written as one long line instead of using `\` continuations.

## 5. Create the namespace

```bash
kubectl apply -f https://raw.githubusercontent.com/nst-sdc/Open-Source-Tracker-NST/main/k8s/00-namespace.yaml
```

You should see `namespace/opensource-tracker created`.

## 6. Create the real Secret

Fill in your own values from steps 1–2 and 3 below, then paste this as **one single line** into the shell:

```bash
kubectl create secret generic opensource-tracker-secrets --namespace=opensource-tracker --from-literal=GITHUB_TOKEN="<your GitHub PAT>" --from-literal=ADMIN_PASSWORD="<pick anything>" --from-literal=GITHUB_CLIENT_ID="<from step 2, or leave empty>" --from-literal=GITHUB_CLIENT_SECRET="<from step 2, or leave empty>" --from-literal=CRON_SECRET="<any random string, e.g. from `openssl rand -hex 16`>" --from-literal=KV_REST_API_URL="<from step 1>" --from-literal=KV_REST_API_TOKEN="<from step 1>" --from-literal=KV_REST_API_READ_ONLY_TOKEN="<from step 1>"
```

`k8s/01-secret.yaml.example` in this repo documents the same fields if you'd rather read them as YAML first — but the command above is what actually gets typed into the cluster; nothing about the Secret ever needs to be written to a file or committed.

If you ever need to change a value later: `kubectl -n opensource-tracker delete secret opensource-tracker-secrets`, then re-run the create command with new values, then `kubectl -n opensource-tracker rollout restart deployment/opensource-tracker` (changing a Secret doesn't automatically restart pods already using it).

## 7. (Only if you made your GHCR package private) create a pull secret

Skip this entirely if you made the package public in step 3 — that's the simpler default and what this guide assumes from here on.

```bash
kubectl create secret docker-registry ghcr-pull-secret --namespace=opensource-tracker --docker-server=ghcr.io --docker-username=<your-github-username> --docker-password=<a GitHub PAT with read:packages scope>
```

You'd also need to add an `imagePullSecrets:` block back to `k8s/02-deployment.yaml` referencing `ghcr-pull-secret` (see the comment already in that file).

## 8. Apply the Deployment, Service, and Ingress

Check the **Packages** tab on your GitHub profile for the exact, lowercased image name GHCR assigned (it may not exactly match this repo's display name), then apply the manifests as-is — `k8s/02-deployment.yaml` in this repo already points at the correct image for this repo:

```bash
kubectl apply -f https://raw.githubusercontent.com/nst-sdc/Open-Source-Tracker-NST/main/k8s/02-deployment.yaml
kubectl apply -f https://raw.githubusercontent.com/nst-sdc/Open-Source-Tracker-NST/main/k8s/03-service.yaml
```

Before applying the Ingress, double-check the hostname isn't already claimed by someone else's app on this shared cluster:

```bash
kubectl get ingress -A
```

Look for `oss-tracker.nstsdc.org` anywhere in the output. If it's taken, edit the `host:` field in `k8s/04-ingress.yaml` (in your own fork/clone) to something else before applying.

```bash
kubectl apply -f https://raw.githubusercontent.com/nst-sdc/Open-Source-Tracker-NST/main/k8s/04-ingress.yaml
```

## 9. Verify

```bash
kubectl -n opensource-tracker get pods
```

Wait for `Running` and `1/1 Ready`, then just try the real URL directly — the Cloudflare Tunnel routing is already live cluster-wide, so there's no DNS/cert step to wait on:

```bash
curl -i https://oss-tracker.nstsdc.org/api/health
```

You should get back `{"ok":true}`. If not:

```bash
kubectl -n opensource-tracker logs deployment/opensource-tracker
kubectl -n opensource-tracker describe pod <pod-name>
```

are the two commands that explain almost every failure mode (crash loop, image pull error, missing env var). `kubectl -n opensource-tracker get pod -o wide` also shows which of the cluster's nodes it landed on — that's chosen automatically by the scheduler; you don't need to (and shouldn't try to) pick one yourself on a shared cluster.

## 10. Wire up the incremental refresh cron

The leaderboard only updates when something calls `/api/refresh/incremental` every 15 minutes. There are two ways to trigger it — use the CronJob; the GitHub Actions option is documented for completeness but doesn't actually work on this repo (explained below).

**Use the Kubernetes CronJob (recommended, and what's actually running):**

```bash
kubectl apply -f https://raw.githubusercontent.com/nst-sdc/Open-Source-Tracker-NST/main/k8s/05-refresh-cronjob.yaml
```

This runs entirely inside the cluster, talking directly to the in-cluster Service (not the public hostname), and has zero dependency on GitHub Actions. To test it immediately instead of waiting up to 15 minutes for the first tick:

```bash
kubectl -n opensource-tracker create job --from=cronjob/opensource-tracker-refresh test-refresh-1
kubectl -n opensource-tracker get jobs      # wait for STATUS=Complete
kubectl -n opensource-tracker logs job/test-refresh-1
```

**Why not GitHub Actions, like the Vercel deployment uses?** This repo's `.github/workflows/refresh-cache.yml` is set up identically (pointed at `secrets.APP_URL`/`secrets.CRON_SECRET`) and manual `workflow_dispatch` triggers do work — but its `schedule:` trigger has never fired on its own, even though the workflow shows as `active`. Most likely an org-level policy restricting scheduled Actions runs specifically (unconfirmed — would need an org owner to check). If you want to try it anyway or investigate further, the same two repo secrets apply:

- `APP_URL` = `https://oss-tracker.nstsdc.org` (or whatever hostname you used)
- `CRON_SECRET` = the exact same value you used for `CRON_SECRET` in step 6's Secret command

**Careful if you're ever tempted to reuse the production `GITHUB_TOKEN`** for a deployment that has any automatic 15-minute trigger wired up (CronJob or Actions): if it shares a GitHub token with the production Vercel app's own 15-minute cron, both will compete for the same rate limit — this is a real, previously-documented incident pattern (see `DOCUMENTATION.md` Section 5.6). Always use your own token when an automatic schedule is live.

## Performance notes: why this might feel slower than Vercel

The first real deploy of this app to the cluster measured page loads around 2–5 seconds, versus a much snappier feel on Vercel. Two separate causes were found, worth checking again if the roster grows or performance regresses:

**1. CPU throttling from an undersized limit (fixed in this repo's manifest).** The original `k8s/02-deployment.yaml` capped the container at `500m` (half a CPU core). Confirmed via the container's cgroup stats:

```bash
kubectl -n opensource-tracker exec deploy/opensource-tracker -- cat /sys/fs/cgroup/cpu.stat
```

`nr_throttled` (periods where the container hit its limit and got paused) and `throttled_usec` (total time spent paused) are the numbers that matter — at the old `500m` limit, `throttled_usec` (13.5s) actually exceeded `usage_usec` (11.4s), meaning the pod spent more time waiting to be allowed to run than actually running. Raising the limit to `1000m` (one full core) cut the throttled/usage ratio from ~119% to ~19%. If pages feel slow again later, check this first before assuming it's a code problem.

**2. A structural cost that's the same on both deployments, just less visible on Vercel.** Even with zero throttling, pages stayed in the 2–3 second range. This is because `summary_cache:<period>` stores **every tracked student's summary in one ~3MB JSON blob** (see [../DOCUMENTATION.md](../DOCUMENTATION.md) Section 5.3) — even the home page's 5-entry preview fetches and parses the entire blob. This is already documented as *"the biggest structural inefficiency in the codebase today"*, not something introduced by this deployment. Vercel's serverless functions likely get more CPU per invocation by default and may sit closer to the Upstash region, which is probably why it feels faster there despite doing the same redundant work. Worth revisiting the caching design (e.g., splitting summary cache into smaller pages) as a separate follow-up if snappier performance matters more than it currently does.

## Troubleshooting

For anything cluster-specific (Traefik quirks, DNS propagation, `kubectl` connectivity, general "this cluster-wide thing is broken"), the cluster's own docs are the source of truth and already cover far more ground than this file should try to duplicate: `nst-sdc/nst-cluster-docs`, especially `reference/tips.md` and `reference/troubleshooting.md`. For anything about this **app's** behavior specifically (caching, rate limits, the admin system), see [ARCHITECTURE.md](./ARCHITECTURE.md) and [../DOCUMENTATION.md](../DOCUMENTATION.md).

## Once this is working: the next step is Fleet, not more manual deploys

Everything above is a **manual** deploy — you `kubectl apply` by hand each time you want the cluster to pick up a new image. That's deliberately the starting point rather than the end state: it's the smallest number of new concepts to learn on day one. The cluster already runs **Fleet** (Rancher's GitOps engine), which can watch this repo and auto-apply `k8s/` on every push — turning step 6 above into "just push to main". Once the manual path above is working end-to-end, wiring up Fleet is a good next project for whoever owns this deployment — see `nst-sdc/nst-cluster-docs`' `guide/fleet.md`.

## Tearing it down

Everything this guide creates lives inside the `opensource-tracker` namespace, so removing it is one command — no need to delete the Deployment, Service, Secret, and Ingress individually:

```bash
kubectl delete namespace opensource-tracker
```

This is fully reversible in the other direction too — nothing about deleting the namespace touches this repo, the GHCR image, or your Upstash database, so redoing the whole walkthrough from step 4 onward brings it right back. Good to know if you're experimenting and want a clean slate, or tearing down a test deploy once you've confirmed everything works.
