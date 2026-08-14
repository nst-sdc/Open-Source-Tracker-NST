# How This Platform Works

The one constraint everything below is built around: **GitHub's Search API allows 30 requests per minute with a token, 10 per minute without one.** With ~1,800+ tracked students, that's nowhere near enough to fetch live data for everyone on every page load. Every mechanic described in this document — caching, the refresh cycle, why signing in matters, why students can't all be checked "right now" — exists because of that one number.

## Why GitHub tokens are needed at all

A GitHub token isn't for permissions here (the app never writes to GitHub on anyone's behalf) — it's purely to unlock GitHub's *authenticated* rate limit instead of its much lower anonymous one. Every call this app makes to GitHub's Search API (`is:pr author:X`, `is:issue author:X`) needs to go through some token, or it's stuck at 10 requests/minute for the entire platform, shared across every visitor. With a token, that ceiling is 30/minute — still not enough to check 1,800 students on demand, which is why nothing here ever tries to.

## Why everyone can't be searched at the same time

Two PRs and issues to fetch = 2 API calls per student. At 30 requests/minute, that's roughly 15 students per minute, per token — about 1,800 students would take over 2 hours *if* nothing else ever touched that same token in the meantime (real visitors, manual refreshes, admin lookups all compete for the same budget). Trying to refresh everyone at once would either blow straight through the rate limit (GitHub starts rejecting requests) or take the entire platform hostage for two-plus hours on every attempt.

So instead of "refresh everyone now," the platform:
1. **Shows cached data by default.** Every page read is a cache lookup, not a live GitHub call — fast (~10-50ms) regardless of GitHub's rate-limit state.
2. **Refreshes a rotating batch in the background, continuously.** Every 15 minutes, a background job picks the ~20-30 stalest (or never-yet-fetched) students and refreshes just them, then moves on. Given enough 15-minute cycles, everyone gets covered — currently around once every 16 hours per student, in the worst case.
3. **Scales automatically as more tokens become available.** More tokens in the shared pool (see below) means more students refreshed per 15-minute cycle, automatically — no code or infrastructure change needed.

## Guest vs. logged-in: what signing in actually does

Signing in is never required — every page, including your own profile, works fully as a guest. But logging in does two things at once, and they're connected:

| | Guest | Signed in |
|---|---|---|
| Browsing the leaderboard, profiles | Full access | Full access |
| Manual refresh cooldown | 5 min (leaderboard), 2 hr (own profile) | None — refresh anytime |
| Viewing an uncached/stale profile | Waits for the background rotation to reach it | Triggers a live fetch immediately, using *your own* token |
| Contributes to the shared token pool | No | Yes — your token joins the rotation for *everyone's* background refreshes |

The mechanism: logging in exchanges a GitHub OAuth code for an access token (read-only, `scope=read:user`), which gets stored two places — an HTTP-only cookie (so *you* get unlimited personal refreshes), and a shared pool in the database (so the *background rotation* can use it too, for any student, not just you). This is a deliberate two-way exchange: you get a better personal experience, and the platform gets more refresh capacity for every other visitor, automatically, the moment you log in. Nobody is required to log in, but everyone benefits when more people do.

## The full request lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BROWSING (guest or logged in — identical either way)                    │
│                                                                            │
│   Browser → GET /contributors                                             │
│      │                                                                    │
│      ▼                                                                    │
│   Read summary_cache:<period> from Redis  ─── no GitHub call at all ──►  Page renders
│      (one shared blob, all students, updated by the background cycle)     (~10-50ms)
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  MANUAL REFRESH — GUEST                                                   │
│                                                                            │
│   Click "Refresh" → cooldown check (5 min leaderboard / 2 hr profile)     │
│      │                                                                    │
│      ├── still cooling down ──► show cached data + "try again in Xm"      │
│      │                                                                    │
│      └── cooldown passed ──► live fetch using the shared fallback token   │
│                                  ──► write result to cache ──► render      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  MANUAL REFRESH — LOGGED IN                                               │
│                                                                            │
│   Click "Refresh" → no cooldown check                                     │
│      │                                                                    │
│      └── live fetch using YOUR OWN token (from your session cookie)       │
│             ──► write result to cache ──► render                          │
│         (doesn't compete with the shared fallback token's budget)         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  BACKGROUND REFRESH — runs every 15 minutes, nobody watching              │
│                                                                            │
│   Trigger fires (K8s CronJob here / GitHub Actions on Vercel)             │
│      │                                                                    │
│      ▼                                                                    │
│   POST /api/refresh/incremental  (authenticated via a shared secret)      │
│      │                                                                    │
│      ▼                                                                    │
│   Pick ~20-30 students: anyone manually queued first, then never-cached,  │
│   then whoever's cache is oldest                                          │
│      │                                                                    │
│      ▼                                                                    │
│   Split across every available token (fallback + everyone's pooled OAuth  │
│   tokens), refresh each group CONCURRENTLY — one token's group never      │
│   waits on another's                                                      │
│      │                                                                    │
│      ▼                                                                    │
│   For each student: fetch PRs + issues from GitHub ──► validate any new   │
│   repos found (star count, spam check) ──► write profile_cache            │
│      │                                                                    │
│      ▼                                                                    │
│   Patch that student's entry into every leaderboard period's summary      │
│   cache (all / week / month / etc.) — nobody else's entry is touched      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  LOGIN FLOW                                                               │
│                                                                            │
│   Click "Sign in with GitHub"                                             │
│      │                                                                    │
│      ▼                                                                    │
│   Redirect to GitHub's OAuth consent screen (read:user scope only —       │
│   read-only, can never write to GitHub on your behalf)                    │
│      │                                                                    │
│      ▼                                                                    │
│   GitHub redirects back with a one-time code                              │
│      │                                                                    │
│      ▼                                                                    │
│   Server exchanges the code for a real access token                       │
│      │                                                                    │
│      ├──► stored in an HTTP-only cookie (this is what gives YOU           │
│      │     unlimited personal refreshes from now on)                      │
│      │                                                                    │
│      └──► added to the shared token pool in the database (this is what    │
│            speeds up the background refresh cycle for EVERYONE)           │
└─────────────────────────────────────────────────────────────────────────┘
```

## What keeps the leaderboard honest

Two independent layers, both automatic:

- **A repo needs at least 5 GitHub stars for merged PRs into it to count.** Catches the common "spam PR into a throwaway repo" pattern without needing an admin to manually catch every instance.
- **A student's own repos never count**, even if they merge their own PRs into them — closes the trivial "make a repo, merge your own PRs" loophole. The one exception is a repo an admin has personally reviewed and explicitly approved for that specific student (Admin Dashboard → Own-Repo PRs) — deliberately a human decision, not an automated threshold, since stars/forks can be coordinated around by a small, connected community in a way an admin's actual judgment can't be.

An admin can also directly flag any individual PR as fake/low-quality/self-authored, overriding either of the above in either direction.

## Where this platform actually runs

Two independent, identically-behaving deployments of the same codebase — see the README for exactly which URLs, which databases, and how each one triggers its background refresh cycle.
