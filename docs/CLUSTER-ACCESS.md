# Cluster Access — Command Reference

How to connect to the NST SDC cluster directly (`nst-n1.nstsdc.org`, K3s), independent of
Rancher's web UI, and the commands for day-to-day operation: checking node/app health,
deploying, rolling back, and managing who has access.

This exists because Rancher's own login can go down (its GitHub OAuth provider has had
outages) without the underlying cluster being affected at all — direct SSH + `kubectl` works
regardless of Rancher's state, and doesn't depend on any web service beyond the cluster itself.

For the app-specific first-time deploy walkthrough (namespace, Secret, Ingress, etc.), see
[DEPLOYMENT.md](./DEPLOYMENT.md) instead — this file covers the cluster generally, once you're
already set up.

## 1. Getting access (ask an existing team member)

Someone who already has an account on `nst-n1` needs to create one for you — see
[section 6](#6-adding-a-new-team-member) below, which they'll run. You'll need to generate
your own SSH key pair first and send them the **public** key (never the private one):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/nstsdc_cluster -C "<your-name>-nstsdc-cluster-access"
cat ~/.ssh/nstsdc_cluster.pub   # send this line to whoever is creating your account
```

## 2. Connecting

One-time setup:
```bash
brew install cloudflared kubectl
```

`~/.ssh/config`:
```
Host nst-n1.nstsdc.org
    ProxyCommand cloudflared access ssh --hostname %h
    User <your-username>
    IdentityFile ~/.ssh/nstsdc_cluster
    IdentitiesOnly yes
```

Connect:
```bash
ssh nst-n1.nstsdc.org
```

This works from anywhere with internet access — the connection goes through a Cloudflare
Tunnel, no VPN or campus network needed.

Once connected, `kubectl` is already configured system-wide — every command below just needs
`sudo` in front of `kubectl` (the K3s admin config is root-only-readable, at
`/etc/rancher/k3s/k3s.yaml`).

## 3. Checking node / cluster health

```bash
sudo kubectl get nodes -o wide                        # every node, status, IP
sudo kubectl describe node <node-name>                 # detailed: conditions, resource pressure
sudo kubectl top nodes                                  # CPU/memory usage per node
sudo kubectl get pods -A                                # every pod, every namespace
sudo kubectl get pods -A --field-selector=status.phase!=Running   # anything not Running
allnodes "hostname; uptime"                             # run a command on every node at once
allnodes "df -h / | tail -1"                            # disk usage across all nodes
allnodes "sudo systemctl is-active k3s-agent"            # is the k3s agent healthy everywhere
```

## 4. Checking the tracker app specifically

```bash
sudo kubectl -n opensource-tracker get pods -o wide
sudo kubectl -n opensource-tracker get deployment opensource-tracker \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'      # what image is configured
sudo kubectl -n opensource-tracker get pod <pod-name> \
  -o jsonpath='{.status.containerStatuses[0].imageID}{"\n"}'         # what's ACTUALLY running (digest)
sudo kubectl -n opensource-tracker logs deploy/opensource-tracker --since=1h
sudo kubectl -n opensource-tracker logs deploy/opensource-tracker --since=1h | grep -i "error\|oauth"
sudo kubectl -n opensource-tracker exec deploy/opensource-tracker -- \
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://api.github.com --max-time 10
sudo kubectl -n opensource-tracker exec deploy/opensource-tracker -- nslookup github.com
```

The image tag alone doesn't guarantee what's actually running — `:latest` gets overwritten by
every new push, but a running pod only re-pulls it on its *next restart*. The `imageID`
command above shows the real digest of what's live; compare it against the digest printed by
your last `docker buildx build --push` to confirm a deploy actually took effect.

## 5. Deploying a new version

Build and push the image from your own machine (needs Docker + `docker login ghcr.io`, **not**
cluster access):

```bash
git clone https://github.com/nst-sdc/Open-Source-Tracker-NST.git /tmp/deploy-build
cd /tmp/deploy-build
SHA=$(git rev-parse --short HEAD)
docker buildx build --platform linux/amd64 \
  -t ghcr.io/nst-sdc/open-source-tracker-nst:latest \
  -t ghcr.io/nst-sdc/open-source-tracker-nst:$SHA \
  --push .
```

Then deploy it (this part needs cluster access):

```bash
sudo kubectl -n opensource-tracker set image deployment/opensource-tracker \
  opensource-tracker=ghcr.io/nst-sdc/open-source-tracker-nst:<SHA>
sudo kubectl -n opensource-tracker rollout status deployment/opensource-tracker
```

Always deploy a specific commit SHA tag, not `:latest` — it makes it unambiguous exactly what's
running, and matches what the digest-check command in section 4 expects to compare against.

## 6. Rolling back

Two independent things can be rolled back — usually you want both in sync, but they're separate
operations.

**A. The running deployment** (fast, immediate):
```bash
sudo kubectl -n opensource-tracker set image deployment/opensource-tracker \
  opensource-tracker=ghcr.io/nst-sdc/open-source-tracker-nst:<PREVIOUS-SHA>
sudo kubectl -n opensource-tracker rollout status deployment/opensource-tracker
```
Or, if you don't know the previous SHA but know it was simply the last rollout:
```bash
sudo kubectl -n opensource-tracker rollout undo deployment/opensource-tracker
sudo kubectl -n opensource-tracker rollout history deployment/opensource-tracker   # see past revisions
```

**B. The GitHub source** (only if the code itself needs undoing, not just the deployment):
```bash
git revert --no-edit <bad-commit-sha>       # safe: adds a new commit undoing it, keeps history
git push origin main
```
Prefer `git revert` over `git reset --hard` + force-push on this repo unless you're certain no
one has local work based on the commits being removed — a revert undoes the change while
keeping every commit hash intact, so it can never break someone else's in-progress work the way
a force-push can.

## 7. Adding a new team member

Run as yourself (or any account with `sudo`) on `nst-n1`, once you have their public key
(see [section 1](#1-getting-access-ask-an-existing-team-member)):

```bash
sudo adduser <username>              # interactive — they'll want to set their own password when they first log in with it, or you set a temporary one here and have them change it
sudo usermod -aG adm,sudo,dip,plugdev,users,docker,fuse,ollama,instructors <username>
sudo mkdir -p /home/<username>/.ssh
echo "<their-public-key-line>" | sudo tee /home/<username>/.ssh/authorized_keys
sudo chown -R <username>:<username> /home/<username>/.ssh
sudo chmod 700 /home/<username>/.ssh
sudo chmod 600 /home/<username>/.ssh/authorized_keys
```

They'll need the same `~/.ssh/config` block as [section 2](#2-connecting), with their own
username and key path.

## 8. Removing a user's access

```bash
sudo deluser <username>                  # removes the account
sudo deluser --remove-home <username>    # also deletes their home directory
```
This only removes SSH/sudo access to this node — it has no effect on Rancher's own user list
or GitHub repo access, which are entirely separate systems and need to be revoked separately.

## 9. Rancher / GitOps

Rancher's web UI (`rancher.nstsdc.org`) is a convenience layer on top of this cluster, not a
requirement — everything above works over direct SSH regardless of whether Rancher's own login
is working. If Rancher's GitHub auth is failing, check whether it's a cluster network/DNS issue
first (section 4's `curl`/`nslookup` commands, run from inside a pod, are a good starting
diagnostic — Rancher's own server-side auth calls hit GitHub the same way).

Fleet (Rancher's GitOps engine, already installed on this cluster) can turn section 5's manual
deploy into "just `git push`" — watching this repo and auto-applying manifests on every change,
so routine deploys don't need cluster access at all. Not currently configured for this repo; see
`nst-sdc/nst-cluster-docs`' `guide/fleet.md` if picking this up as a project.
