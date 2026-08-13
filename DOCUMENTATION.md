# Opensource Tracker NST — Project Documentation

> **Last updated:** July 2026 | **Version:** v2 | **Framework:** Next.js 16 (App Router)

A comprehensive technical reference for current and future contributors. Covers architecture, design decisions, data flow, every page and component, and operational notes.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Design Philosophy](#2-tech-stack--design-philosophy)
3. [Repository Structure](#3-repository-structure)
4. [Data Layer](#4-data-layer)
5. [Caching Architecture](#5-caching-architecture)
6. [GitHub API Integration](#6-github-api-integration)
7. [Pages & Routes](#7-pages--routes)
8. [Components](#8-components)
9. [API Routes](#9-api-routes)
10. [Admin System](#10-admin-system)
11. [Auth: Admin, Student, and Guest](#11-auth-admin-student-and-guest)
12. [Deployment & Infrastructure](#12-deployment--infrastructure)
13. [Environment Variables](#13-environment-variables)
14. [Design System](#14-design-system)
15. [Known Behaviours & Gotchas](#15-known-behaviours--gotchas)
16. [Contributor Guide](#16-contributor-guide)

---

## 1. Project Overview

**Opensource Tracker NST** is a leaderboard and visibility platform for tracking open source contributions made by students of NST across three campuses (Rishihood, ADYPU, SVYASA). It fetches pull requests and issues from the GitHub Search API, ranks students by the number of clean merged PRs, and surfaces this data in a public dashboard.

### Goals

- **Transparency** — every student's contributions are visible and linkable.
- **Motivation** — real-time rankings and achievement badges encourage consistent contributions.
- **Integrity** — an admin system flags fake/low-quality PRs, and an automatic repo-validation layer penalizes PRs merged into 0-star/spam repositories, so both are excluded from rankings.
- **Education** — a "Common Issues" page teaches open source Git workflows to beginners.
- **Growth** — a public join-request flow lets students self-register; admins approve from a queue.

### What It Is NOT

- It does not write to GitHub on a student's behalf (OAuth login only raises the logged-in user's own rate limit and contributes their token to a shared pool — see Section 11).
- It does not gate the leaderboard, profiles, or any public page behind login — everything is public by design.
- It is not a repository management tool.

---

## 2. Tech Stack & Design Philosophy

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | Server Components for fast TTFB; built-in ISR |
| Language | **TypeScript** | Type safety for GitHub API shapes and data transforms |
| Styling | **TailwindCSS v4** | Utility-first rapid UI; v4 uses `@tailwindcss/postcss` |
| Fonts | **Geist + Geist Mono** (`next/font/google`) | Clean, modern, developer-centric aesthetic |
| Caching | **Vercel KV (Upstash Redis)** + local disk fallback | Serverless-compatible persistent cache; avoids GitHub rate limits |
| Deployment | **Vercel** (manual + git-triggered deploys) | Zero-config Next.js hosting |
| Scheduling | **GitHub Actions** (primary) + one legacy Vercel cron | See Section 12 |
| Data files | **JSON files** in `/data/` — **seed data only**, see Section 4 | Simple, git-trackable initial state |
| Images | Next.js `<Image>` with `avatars.githubusercontent.com` allowed | Automatic optimization of GitHub avatar images |

### Core Design Principles

**1. Cache-First, API-Second**
Every page that touches GitHub data reads from KV cache first. Only a background refresh job (or an explicit manual refresh) calls the GitHub API. This is the single most important constraint on the whole system: GitHub's Search API allows **30 requests/minute with a token, 10/minute without** — everything about the caching and refresh design exists to stay under that ceiling across ~1,900 tracked students.

**2. Server Components by Default**
Almost everything is a React Server Component. Client Components (`'use client'`) are used only when browser APIs are needed (clipboard, router, local state).

**3. Zero-Dependency KV Client**
`lib/kv.ts` talks to Upstash Redis via raw HTTP REST — no npm SDK.

**4. Transparent Local Dev Fallback**
When `KV_REST_API_URL`/`KV_REST_API_TOKEN` are absent, the KV layer falls back to reading/writing JSON files in `data/kv/`. No Redis setup required for local dev.

**5. KV Is the Source of Truth — Not the Committed JSON Files**
This is a common point of confusion (see Section 4): `data/students.json`, `data/events.json`, `data/achievers.json`, and `data/flagged_prs.json` are **one-time seed files**, read only if the corresponding KV key doesn't exist yet. Once KV is populated (it is, in production), editing these JSON files and redeploying has **no effect** on the live site. All mutations go through the admin dashboard or the public join-request flow, which write directly to KV.

**6. Dark Mode Only**
Fixed dark color scheme (`bg-[#0d0d14]`), intentional — no light mode.

---

## 3. Repository Structure

```
OpenSource_NST_Tracker/
│
├── app/                              # Next.js App Router pages & components
│   ├── layout.tsx                    # Root layout: <Nav />, fonts, metadata
│   ├── page.tsx                      # Home page (/)
│   ├── globals.css
│   │
│   ├── components/
│   │   ├── Nav.tsx                   # Sticky nav, shows session state (Client)
│   │   ├── UpcomingEvents.tsx        # Events timeline widget (Client)
│   │   ├── SmoothScroll.tsx          # Lenis smooth scroll wrapper (Client)
│   │   └── FloatingCelebration.tsx   # Celebration animation (Client)
│   │
│   ├── contributors/
│   │   ├── page.tsx                  # Leaderboard (/contributors)
│   │   ├── loading.tsx
│   │   ├── FilterBar.tsx             # Period/search/year/campus filter (Client)
│   │   ├── RefreshButton.tsx         # Manual refresh + login nudge (Client)
│   │   ├── ShareButton.tsx           # Copy/Twitter/WhatsApp share (Client)
│   │   └── [username]/
│   │       ├── page.tsx              # Individual contributor profile
│   │       └── loading.tsx
│   │
│   ├── achievers/
│   │   ├── page.tsx                  # Hall of Fame (/achievers)
│   │   └── [username]/page.tsx       # Individual achiever profile
│   │
│   ├── check-work/
│   │   ├── page.tsx                  # Lookup form for previewing any GitHub user
│   │   └── [username]/page.tsx       # Live, uncached PR/issue preview for one user
│   │
│   ├── join/page.tsx                 # Public self-registration form
│   ├── login/page.tsx                # GitHub OAuth sign-in (optional upgrade, not a gate)
│   ├── programs/page.tsx             # Open source programs directory (static)
│   ├── get-started/page.tsx          # "How to contribute" guide (static)
│   ├── repo-activity/page.tsx        # Repo-level activity view
│   │
│   ├── issues/
│   │   ├── page.tsx                  # Common Issues page (server)
│   │   └── IssuesClient.tsx          # Accordion interaction (Client)
│   │
│   ├── admin/
│   │   ├── page.tsx                  # Admin login form (Client)
│   │   └── dashboard/
│   │       ├── page.tsx              # Dashboard wrapper (Server)
│   │       └── AdminDashboardClient.tsx  # Full admin UI (Client)
│   │
│   └── api/
│       ├── refresh/
│       │   ├── route.ts              # GET/POST — cache status & single-student/period refresh
│       │   └── incremental/route.ts  # GET/POST — cron-driven round-robin stale-profile refresh
│       ├── auth/
│       │   ├── github/route.ts               # Initiates OAuth redirect
│       │   ├── github/callback/route.ts      # Exchanges code, sets cookie, adds token to pool
│       │   ├── session/route.ts               # Returns current login state
│       │   └── logout/route.ts
│       ├── join-requests/route.ts    # Public: check eligibility / submit a join request
│       ├── weekly-contributors/route.ts
│       ├── repo-activity/route.ts
│       ├── user-activity/route.ts
│       └── admin/
│           ├── auth/route.ts         # POST — admin login (sets session cookie)
│           ├── students/route.ts     # CRUD for tracked students
│           ├── flag/route.ts         # POST/DELETE — flag or unflag a PR
│           ├── approve/route.ts      # POST — approve/un-approve a PR
│           ├── join-requests/route.ts # List/manage pending join requests
│           ├── queue/route.ts        # Unreviewed-PR review queue
│           ├── events/route.ts       # CRUD for events
│           └── achievers/route.ts    # CRUD for Hall of Fame entries
│
├── lib/                               # Shared server-side utilities
│   ├── github.ts                      # GitHub API types, fetch functions, scoring (~800 lines)
│   ├── kv.ts                          # KV cache abstraction (Upstash or disk fallback)
│   ├── profile-cache.ts               # Per-student PR/issue cache read/write
│   ├── summary-cache.ts               # Leaderboard summary cache (one blob per period)
│   ├── repo-cache.ts                  # Repo star-count validation cache (spam detection)
│   ├── kv-students.ts                 # KV-backed tracked-student list (CRUD)
│   ├── kv-join-requests.ts            # KV-backed join-request queue
│   ├── kv-events.ts                   # KV-backed events list
│   ├── kv-achievers.ts                # KV-backed Hall of Fame entries
│   ├── flagged.ts                     # KV-backed flagged-PR list
│   ├── reviewed.ts                    # KV-backed admin-reviewed PR list
│   ├── admin-auth.ts                  # Shared admin cookie check — import this, don't re-implement it
│   ├── data.ts                        # PROGRAM_MAP + achiever/event JSON helpers
│   └── types.ts                       # Shared TypeScript interfaces (EventItem)
│
├── data/                               # Seed JSON (see Section 4 — NOT the live source of truth)
│   ├── students.json
│   ├── achievers.json
│   ├── events.json
│   ├── flagged_prs.json
│   └── reviewed_prs.json
│
├── data/kv/                            # Local-dev-only disk cache (gitignored), mirrors KV keys
│
├── proxy.ts                            # Middleware equivalent in this Next.js version — gates
│                                        # only /api/refresh/incremental behind CRON_SECRET
├── vercel.json                         # Legacy daily cron (see Section 12)
└── .github/workflows/
    ├── refresh-cache.yml               # PRIMARY: incremental refresh every 15 min
    └── refresh.yml                     # Manual-only full reseed (see Section 12 — do not re-enable its schedule)
```

---

## 4. Data Layer

**Read this before touching anything in `data/*.json` — they are not what actually drives the live site.**

Every collection below lives in exactly one Upstash Redis key, as a single JSON blob holding the *entire* collection. The corresponding `lib/kv-*.ts` / `lib/*.ts` helper reads that key first; **only if the key has never been set** does it fall back to seeding from the committed JSON file (and then writes that seed into KV so it never reads the file again).

| Collection | KV key | Seed file | Managed via |
|---|---|---|---|
| Tracked students | `students_list` | `data/students.json` | Admin dashboard (`/api/admin/students`) or approved join requests |
| Hall of Fame | *(see `lib/kv-achievers.ts`)* | `data/achievers.json` | Admin dashboard (`/api/admin/achievers`) |
| Events timeline | *(see `lib/kv-events.ts`)* | `data/events.json` | Admin dashboard (`/api/admin/events`) |
| Flagged PRs | `flagged_prs` | `data/flagged_prs.json` | Admin dashboard (`/api/admin/flag`) |
| Reviewed PRs | *(see `lib/reviewed.ts`)* | `data/reviewed_prs.json` | Admin dashboard (`/api/admin/approve`) |
| Repo validation | `repo_cache_map` | — (built entirely at runtime) | Automatic — see Section 6.4 |
| Shared GitHub tokens | `github_token_pool` | — | Automatic on OAuth login — see Section 11 |
| Pending join requests | *(see `lib/kv-join-requests.ts`)* | — | Public submission via `/join` |

**Practical consequence**: editing `data/students.json` and pushing a commit does **nothing** to production once `students_list` exists in KV (it already does — ~1,900 entries). To add a student, use the admin dashboard's "Add Student" form, or approve their submission from `/join` via the admin queue.

### 4.1 `data/achievers.json` schema (still the reference schema, even though KV is authoritative at runtime)

```json
[
  {
    "github": "username",
    "name": "Full Name",
    "headline": "Short bio",
    "bookingUrl": "https://...",
    "programs": [
      { "name": "GSoC", "year": 2024, "org": "Organization", "url": "https://..." }
    ]
  }
]
```

**Supported program names** (auto-styled via `PROGRAM_MAP` in `lib/data.ts`): `GSoC`, `Summer of Bitcoin`, `ESoC`, `Outreachy`, `LFX`, `MLH`, `Hacktoberfest`. Unrecognized names render with a generic style — not an error.

### 4.2 `data/events.json` schema

```json
[
  { "id": "unique-id", "title": "Event Title", "date": "2026-07-15", "type": "session", "description": "...", "link": "https://..." }
]
```
`type` is one of `session` | `deadline` | `announcement`.

### 4.3 Flagged & reviewed PRs

Managed exclusively through the admin dashboard — `lib/flagged.ts` / `lib/reviewed.ts` are the only writers. Flagged PRs are **never deleted**: they stay visible on the student's profile but are excluded from `scoreMergedPRs`.

---

## 5. Caching Architecture

This is the most critical system to understand before making changes.

### 5.1 Two-Level Cache

```
Any Request
    │
    ▼
┌──────────────────────────────────────────┐
│            lib/kv.ts (KV Layer)          │
│                                          │
│   KV_REST_API_URL + TOKEN present?       │
│     YES → Upstash Redis (REST API)       │  ← Production
│     NO  → data/kv/*.json (disk files)   │  ← Local development
└──────────────────────────────────────────┘
```

`kvSet()` returns a `boolean` — **check it, or at least don't assume success**. Upstash's REST API hard-rejects any single write over **10MB** with a `413`. This has bitten real students with unusually high PR/issue counts (any request pushing a cache entry over ~10MB fails outright), which is why `lib/profile-cache.ts` trims every cached PR/issue object down to exactly the fields the app uses (see 5.2) instead of storing GitHub's full raw API response — the raw response includes body text, assignees, milestones, reactions, etc. that this app never reads, and it was enough to blow past the limit for prolific contributors.

### 5.2 Profile Cache (`lib/profile-cache.ts`)

**KV key format:** `profile_cache:<username_lowercase>`
**Physical TTL:** 30 days (`EX 2592000` on write) — entries don't need to survive forever, but they shouldn't vanish just because the incremental refresh hasn't reached that student yet.
**Freshness threshold used by the incremental cron:** 24 hours (`STALE_THRESHOLD_MS` in `updateStaleProfiles`) — this is a *different* number from the physical TTL; don't confuse them.

**Cached data per student** (trimmed shape — not GitHub's raw response):
```typescript
interface ProfileCacheEntry {
  cachedAt: string;
  profile: GitHubUser;
  prs: StudentPR[];       // trimmed to id, number, title, state, urls, dates, draft, labels, pull_request.merged_at, user
  issues: StudentIssue[]; // trimmed similarly
}
```

**Cache lifecycle:**
- Read on: `GET /contributors/[username]`, `POST /api/refresh?username=X`, the incremental cron
- Written on: `POST /api/refresh?username=X` (manual), or `refreshStudentCache()` inside the incremental cron
- Stale cache is used as a fallback if a live refresh attempt fails (rate limit, network error, or a rejected KV write)
- The public manual-refresh button has a **2-hour cooldown for anonymous users**; logged-in users have no cooldown (see Section 11)

### 5.3 Summary Cache (`lib/summary-cache.ts`)

**KV key format:** `summary_cache:<period>` — one giant blob per period (`all`, `1day`, `week`, `month`, `2months`, `3months`, `6months`, `year`), each holding **every tracked student's summary**.
**TTL:** none — summary caches are written without an expiry and are treated as permanent, updated only by incremental patches (see 5.4). This was a deliberate choice ("Make summary cache permanent to prevent leaderboard fluctuations") so the leaderboard never drops to zero because of an expired key.

**Cost this incurs**: because each period is one blob, patching a *single* student's entry means reading and rewriting the *entire* ~1,900-entry array. This is the biggest structural inefficiency in the codebase today — fine at current scale, worth revisiting if the roster grows much further or reads/writes start showing latency.

### 5.4 Refresh Architecture — Three Generations, Only One Is Live

The refresh mechanism went through several redesigns. Understanding *all three* matters because remnants of the earlier ones are still in the codebase (some intentionally kept as manual fallbacks, one now removed):

**Generation 1 (retired)**: `getStudentSummary()` — fetched one page of a student's PRs live and scaled the count by `total_count / sample_size` to estimate merged/open/closed counts without full pagination. This function has been removed (it had zero callers left — the entire codebase had already moved on to exact counts from cache). If you see "scaled/estimated leaderboard counts" mentioned anywhere outside old commit messages, it's stale — the leaderboard shows exact counts from `profile_cache` now.

**Generation 2 (retired)**: a "batch fetch" optimization in `getAllStudentSummaries()` that combined 5 students into one GitHub search query using `is:pr (author:a OR author:b OR ... OR author:e)`, to save API calls. **This query is rejected outright by GitHub's Search API** — verified empirically: even `author:torvalds OR author:octocat` (two well-known, valid accounts) returns `422 Validation Failed`, contradicting GitHub's own documented "up to 5 operators" limit. No current code path calls this with `forceLive: true` anymore (that flag is `false` everywhere it's invoked today), but historically, when it *was* invoked live, every batch failed and any student with no prior cache got a zero-PR placeholder — in some cases written directly into their `profile_cache` entry. **This has been fixed**: `getAllStudentSummaries`'s live-fetch path now loops over students individually using the same reliable single-author search `getStudentPRs`/`getStudentIssues` already use elsewhere, at the cost of one request pair per student instead of per five.

**Generation 3 (current, primary)**: `updateStaleProfiles(batchSize?)` — a round-robin function that, each time it runs, selects students to refresh: first anything in the manual `refresh_queue` (populated when a rate-limited manual refresh gets deferred), then students with no cache at all, then the oldest stale (>24h) cached students. Called with no argument by `/api/refresh/incremental` (a GitHub Actions workflow hits it every 15 minutes), it auto-scales its own batch size instead of using a fixed number:

- `computeAutoBatchSize(tokenCount)` selects up to `tokenCount * PER_TOKEN_CANDIDATE_POOL` (50) candidates, capped at `MAX_TOTAL_BATCH` (400) — more tokens in the shared `github_token_pool` means more candidates picked per tick, automatically, with no code change.
- Selected candidates are split evenly across every available token and processed **concurrently**, one group per token, each group using its own token's independent 30 req/min budget.
- The real safety bound is **not** the batch size — it's `TICK_DEADLINE_MS` (150s), a hard wall-clock cutoff checked before starting each student within a group. Whatever a group can't finish before the deadline simply stays stale and gets picked up next tick. This was deliberately chosen over estimating "time per student" and sizing the batch to fit: per-student cost is unpredictable (`validateNewRepos`, Section 6.4, can add anywhere from 0 to many extra calls depending on how many never-before-seen repos a student's PRs touch), so a time-estimate approach was tried first and hit `FUNCTION_INVOCATION_TIMEOUT` in production.

**Practical throughput**: with a single token, this refreshes on the order of ~30 students per 15-minute tick (verified: 29 students in 157.5s), i.e. roughly the whole current ~1,900-student roster every ~16 hours — down from ~3.8 days under the old fixed-batch-size-5 design. Throughput scales further, automatically, as more students log in and contribute additional OAuth tokens to the pool (Section 11.2).

### 5.5 Cache Invalidation Flow (Admin Flags a PR)

```
Admin flags a PR in dashboard
        │
        ▼
POST /api/admin/flag
        │
        ├── Writes PR to the flagged-PR KV list
        │
        └── calls invalidateSummaryCache()
                │
                ▼
            Sets cachedAt='1970-01-01T00:00:00.000Z' on every period's summary cache
                │
                ▼
            Next /contributors request treats it as stale
            → next refresh cycle (manual or incremental) recomputes with the PR excluded
```

### 5.6 Rate Limiting Design

| Context | Cooldown | Enforced Where |
|---|---|---|
| Public refresh button (leaderboard, anonymous) | 5 minutes | `/api/refresh` route (`isCacheFresh`) |
| Public refresh button (profile, anonymous) | 2 hours | `/api/refresh?username=X` route |
| Logged-in user, either button | none | same routes, bypassed when a session cookie is present |
| Incremental cron | 15 minutes, auto-scaled batch (Section 5.4) | GitHub Actions `refresh-cache.yml` → `/api/refresh/incremental` |
| GitHub Search API (unauthenticated) | 10 req/min | GitHub-enforced |
| GitHub Search API (with a token) | 30 req/min | GitHub-enforced, and shared across **every** request using that token — see Section 11 |

**Do not run two automatic refresh schedules at once.** `refresh.yml`'s schedule trigger was removed for exactly this reason: it and `refresh-cache.yml` both drove requests through the same shared token, and running concurrently pushed combined throughput past the 30 req/min ceiling, causing intermittent "GitHub rate limit exceeded" failures that looked like they were tied to specific students but were really just whoever's request landed during the exhausted window. `refresh.yml` still exists as a manual `workflow_dispatch` for deliberate full reseeds — trigger it by hand, don't re-add its `schedule:` trigger.

---

## 6. GitHub API Integration

### 6.1 Authentication

See Section 11 for the full picture — in short: a logged-in visitor's own OAuth token is used for their requests; guests get a random token from `github_token_pool` (contributed by anyone who's ever logged in) or fall back to the single shared `GITHUB_TOKEN` env var if the pool is empty (it currently is, in production — nobody has logged in yet in a way that populated it).

### 6.2 Key Functions in `lib/github.ts`

| Function | GitHub Endpoint | Returns |
|---|---|---|
| `getStudentProfile(username)` | `GET /users/:username` | Full GitHub user object |
| `getStudentPRs(username)` | Search: `is:pr author:X -user:X` | All external PRs (paginated, up to 1000 with a token) |
| `getStudentIssues(username)` | Search: `is:issue author:X -user:X` | All external issues (paginated) |
| `getAllStudentSummaries(dateQuery, flagged, forceLive)` | Reads `profile_cache` per student (default), or fetches live per-student if `forceLive: true` | Full ranked leaderboard array |
| `refreshStudentCache(username)` | Profile + PRs + issues, sequentially | Writes to `profile_cache`, used by the incremental cron |

**Search query design — why `-user:X`:** excludes PRs/issues in repos owned by the student themselves. Self-contributions to your own repos don't count toward the score by default. Intentional, and closes an obvious gaming vector — without it, anyone could create a repo and merge their own PRs into it with zero external review.

**The one exception — own-repo PR allowlist (`lib/kv-own-repo-exceptions.ts`):** a student who's built a genuinely used open source project can share it with an admin, who reviews it personally and adds the specific `{username, repo}` pair via the admin dashboard's **Own-Repo PRs** tab (`/api/admin/own-repos`). Once approved, `getStudentPRs` runs a second, separate search (`is:pr author:X user:X`) scoped to just that student's own repos, and keeps only PRs matching an allowlisted repo. Deliberately **not** gated on an automated metric like star or fork counts — in a small, socially-connected student community, coordinating a handful of friends to star+fork a throwaway repo is trivial and completely undetectable by any such metric. A human actually looking at the project is the only check that can't be gamed this way. `getSummaryFromCache` bypasses the star-validation exclusion specifically for allowlisted repos, so a low star count on an admin-approved project doesn't silently undo the approval.

### 6.3 Pagination Strategy

| Function | Pages Fetched | Max Results |
|---|---|---|
| `getStudentPRs` | Up to 3 (no token) / 10 (with token) | 300 / 1000 |
| `getStudentIssues` | Up to 3 (no token) / 10 (with token) | 300 / 1000 |

Every leaderboard number shown is now an **exact** count from full pagination — there is no scaled-estimate path anymore (see 5.4, Generation 1).

### 6.4 Repo Validation / Spam Filtering (`lib/repo-cache.ts`)

Any repository a merged PR points to gets checked once for star count (`GET /repos/:owner/:repo`) and cached permanently in `repo_cache_map`. A repo with **fewer than 5 stars is marked invalid**, and merged PRs into it are penalized in `scoreMergedPRs` — this is the automatic half of the integrity system, catching the common "spam PR into a throwaway repo" gaming pattern without needing an admin to manually flag every instance. It runs alongside, not instead of, manual flagging (`lib/flagged.ts`) — an admin can still override either way via `manualOverride`.

### 6.5 `repoFromUrl(url)` Utility

Converts `https://api.github.com/repos/org/repo` → `org/repo`. Used for grouping PRs by repository and building the `owner/repo#number` keys used throughout the flagging/validation system.

---

## 7. Pages & Routes

### 7.1 Home (`/`)

**File:** `app/page.tsx` · **Rendering:** `force-dynamic`

Reads only from KV (events, achievers, summary cache) — no GitHub API calls, so it stays fast (~10-50ms) regardless of GitHub's rate limit state. Renders: hero stats, top-5 preview, Hall of Fame mini-section, nav cards, upcoming events.

### 7.2 Contributors Leaderboard (`/contributors`)

**File:** `app/contributors/page.tsx` · **Rendering:** `force-dynamic`

**Query params:** `period` (`all`, `1day`, `week`, `month`, `2months`, `3months`, `6months`, `year`, `custom`), `from`, `to`, `search`, `year`, `campus`.

Reads the matching `summary_cache:<period>` entry directly — it does **not** trigger a live GitHub fetch on page load. If a student has no `profile_cache` entry yet, they render as a zero-stat placeholder (see Section 15 — this is indistinguishable from a genuine zero until they're refreshed, manually or by the incremental cron).

**Ranking metric:** `scoreMergedPRs = mergedPRs - flaggedMergedPRs - invalidRepoMergedPRs`.

### 7.3 Contributor Profile (`/contributors/[username]`)

**File:** `app/contributors/[username]/page.tsx`

Reads `profile_cache` for the username; if missing or the manual-refresh cooldown has passed, triggers a live fetch. Falls back to stale cache if the live fetch fails. Tabs: PRs (default, grouped by repo), Merged, Open, Issues. Achievement badges computed client-side from the PR/issue list (First Merge, Merging Machine, Bug Squasher, Doc Hero, Speed Demon — see original criteria table, unchanged).

### 7.4 Hall of Fame (`/achievers`) & Achiever Profile (`/achievers/[username]`)

Data from the achievers KV collection (seeded from `data/achievers.json`, see Section 4). Achiever profiles fetch live GitHub data directly (not via `profile_cache`) since they're visited far less often and the data is supplementary, not ranking-critical.

### 7.5 Check Work (`/check-work`, `/check-work/[username]`)

**Purpose:** preview *any* GitHub user's PRs/issues — not just tracked students — most useful for an admin vetting a join request before approving it, or a student previewing their own eligibility before applying.

**Important:** this route does a **fully live, uncached** fetch on every single pageview (`dynamic = 'force-dynamic'`, no `profile_cache` involved at all). It shows a dedicated "GitHub API Rate Limit Hit" page if the shared token is exhausted at that moment, with a nudge to log in. Because it's uncached, a burst of activity here (e.g. an admin reviewing several join requests back to back) draws on the same shared rate-limit budget as everything else — worth keeping in mind if it becomes a frequent flow.

### 7.6 Join (`/join`)

Public self-registration form. Backed by `POST /api/join-requests` — checks the username isn't already tracked or pending, validates it exists on GitHub, then queues it for admin approval (`/api/admin/join-requests`, `/api/admin/queue`).

### 7.7 Login (`/login`)

**Not a gate.** Framed as an optional upgrade: logging in raises your own personal rate limit to GitHub's authenticated ceiling and contributes your token to the shared guest pool (Section 11). Every other public page works fully without it.

### 7.8 Programs, Get Started, Common Issues, Repo Activity

Static or lightly-dynamic informational pages — unchanged in design from prior versions. See component-level comments in each file for content structure.

### 7.9 Admin Login (`/admin`) & Dashboard (`/admin/dashboard`)

Password form → sets `admin_session` cookie → full dashboard (flag/unflag PRs, approve join requests, manage students/events/achievers). See Section 10.

---

## 8. Components

Unchanged from prior documentation for `Nav`, `FilterBar`, `RefreshButton`, `ShareButton`, `UpcomingEvents`, `SmoothScroll` — see inline comments in each file. One addition:

### 8.1 `FloatingCelebration` (`app/components/FloatingCelebration.tsx`)

**Type:** Client Component. Celebratory animation triggered on specific milestone events (e.g. a fresh merge). Self-contained, no external state dependencies.

### 8.2 `Nav` session awareness

`Nav.tsx` calls `GET /api/auth/session` on mount and on every path change, and renders either a "Sign In" affordance or the logged-in user's avatar/username with quick links to their own profile and check-work page.

---

## 9. API Routes

### `GET /api/refresh` · `POST /api/refresh`

Cache status and manual refresh trigger. See Section 5.6 for cooldown rules. `POST` with `?username=X` refreshes one student; without it, refreshes the `?period=` summary (defaults to `all`) from whatever's currently in each student's `profile_cache` (no live GitHub calls unless `forceLive` is explicitly requested by the caller — the public route never does).

### `GET /api/refresh/incremental` · `POST /api/refresh/incremental`

Gated by `CRON_SECRET` (checked in `proxy.ts`, not in the route itself — see Section 11). Runs `updateStaleProfiles()` (auto-scaled batch size, Section 5.4) and patches the `all`/`week`/`month` summary caches for whichever students were touched. This is what the 15-minute GitHub Actions workflow calls.

### `GET/POST /api/join-requests`

Public. `GET ?username=X` checks eligibility (already tracked / already pending / not found / eligible) without submitting anything. `POST` submits a request into the pending queue.

### `POST /api/admin/auth` · `DELETE /api/admin/auth`

Validates `ADMIN_PASSWORD`, sets/clears the `admin_session` cookie.

### `GET/POST/PUT/DELETE /api/admin/students`

Full CRUD for the tracked-student list. All four verbs are gated by `checkAdminAuth()` from `lib/admin-auth.ts` — every admin route should import this rather than re-implementing the cookie check locally (a prior inconsistency here has been cleaned up; keep it that way).

### `POST/DELETE /api/admin/flag` · `POST /api/admin/approve`

Flag/unflag a PR, or mark it reviewed. Both invalidate the summary cache on write.

### `GET/POST /api/admin/join-requests` · `GET/POST /api/admin/queue`

List and act on pending join requests and the PR review queue.

### `GET/POST/PUT/DELETE /api/admin/events` · `.../achievers`

CRUD for the events timeline and Hall of Fame entries.

### `GET/POST/DELETE /api/admin/own-repos`

CRUD for the own-repo PR exception allowlist (see Section 6.2) — which specific students' specific own repos have been manually approved to count self-authored merged PRs.

### `GET /api/auth/github` · `GET /api/auth/github/callback` · `GET /api/auth/session` · `GET /api/auth/logout`

See Section 11 in full.

### `GET /api/weekly-contributors` · `GET /api/repo-activity` · `GET /api/user-activity`

Supplementary read-only views built on top of cached summary/profile data.

---

## 10. Admin System

### Authentication

- Single shared password (`ADMIN_PASSWORD`), no per-admin accounts or roles.
- Verified by `checkAdminAuth()` in `lib/admin-auth.ts` — **this is the only place that should check the cookie**; every admin route imports it.
- Session cookie is HTTP-only, no automatic expiry beyond the browser session.

### Capabilities

- View all PRs across all students with status, flag state, and approval state.
- Flag a PR as `fake`, `self_pr`, or `low_quality` with an optional note; unflag at any time.
- Approve/un-approve a PR.
- Add/edit/remove tracked students (year, campus).
- Review and approve/reject pending join requests.
- Manage the events timeline and Hall of Fame entries.
- Approve a specific student's specific own-repo as an exception, so their self-authored merged PRs into that repo count (see Section 6.2) — revocable at any time.

### Flagging Philosophy

Flagged PRs are **never deleted** — they stay visible on the student's profile, are excluded only from `scoreMergedPRs`, and can be reversed at any time. This preserves an audit trail without silently hiding data.

---

## 11. Auth: Admin, Student, and Guest

There are **three unrelated access concepts** in this app — worth being explicit about since they're easy to conflate:

### 11.1 Admin access

One shared password gates `/admin/dashboard` and every `/api/admin/*` route, via a cookie checked by `checkAdminAuth()`. No connection to GitHub identity at all.

### 11.2 GitHub OAuth ("Sign In with GitHub")

**This does not authenticate a student against the leaderboard** — there's no concept of "your account" beyond the token itself. What it actually does:

1. `GET /api/auth/github` redirects to GitHub's OAuth authorize URL (`scope=read:user` only — read-only).
2. `GET /api/auth/github/callback` exchanges the code for an access token, stores it in an HTTP-only `github_oauth_token` cookie (30-day expiry), then fetches the user's GitHub login and **adds `{ [login]: accessToken }` into the shared `github_token_pool` KV map**.
3. From then on, `getGitHubHeaders()` in `lib/github.ts` uses *your* token for *your* requests (personal 5,000 req/hr core limit, 30 req/min search), and *any guest's* request may randomly draw *your* token from the pool.

This means logging in is simultaneously a personal upgrade (unlimited refresh cooldowns, see Section 5.6) and a contribution to shared capacity for every other visitor. **As of this writing, the token pool is empty in production** — nobody has logged in in a way that populated it, so 100% of guest traffic runs on the single fallback `GITHUB_TOKEN`. If guest-facing rate limiting becomes a recurring problem, driving actual logins (or seeding the pool manually) is the highest-leverage fix available without code changes.

### 11.3 Guests

Everything is public without logging in — `proxy.ts` (this Next.js version's middleware file) gates exactly one route, `/api/refresh/incremental`, behind `CRON_SECRET`. Nothing else requires authentication. The `/login` page is an *optional upgrade* prompt, not an access gate — don't let its copy (or your own assumptions) imply otherwise; a prior version of this page incorrectly framed login as required, which has been corrected.

---

## 12. Deployment & Infrastructure

### Vercel Setup

Connect the repo, set environment variables (Section 13), link an Upstash-backed KV store, deploy.

### Scheduling — GitHub Actions is primary, Vercel cron is legacy

**`.github/workflows/refresh-cache.yml`** — runs every 15 minutes, `POST`s `/api/refresh/incremental` with `x-cron-secret`. This is the primary, always-on refresh mechanism (Section 5.4, Generation 3).

**`.github/workflows/refresh.yml`** — `workflow_dispatch` only (manual trigger from the Actions tab). Runs `scripts/seed-all.js`, which calls the same incremental endpoint in a tight loop until the whole roster is caught up. **Do not add a `schedule:` trigger back to this file** — running it concurrently with `refresh-cache.yml` was the direct cause of a real production incident: both hit the same shared GitHub token, and combined they exceeded the 30 req/min search ceiling, causing intermittent rate-limit failures for whichever student's refresh happened to be in flight at the time.

**`vercel.json`** still configures a native Vercel cron hitting `/api/refresh/incremental` once daily — redundant with the 15-minute GitHub Actions workflow, low-impact (once/day), left in place but not the mechanism to reason about if you're debugging refresh timing.

### Scaling Characteristics

- Cache hit (KV read): ~10–50ms.
- Cache miss (live GitHub fetch): ~200–1000ms, and bounded by the 30 req/min shared-token ceiling — this, not compute, is the bottleneck at current scale.
- The incremental cron's 5-students/15-minutes throughput (~480/day) is below what a full daily refresh of ~1,900 students needs — see Section 5.4. This is a known, accepted gap, not an oversight to "fix" reflexively; changing it is a capacity/frequency tradeoff decision, not a bug fix.

---

## 13. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Recommended | Fallback token used when no OAuth pool token is available. Read-only public-repo scope is sufficient. |
| `ADMIN_PASSWORD` | Yes (for admin) | Password for `/admin`. Without it, admin API routes return 401. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Yes (for OAuth login) | GitHub OAuth App credentials — without these, `/api/auth/github` returns a config error in production. |
| `CRON_SECRET` | Yes (for incremental refresh) | Must match `x-cron-secret` sent by `refresh-cache.yml` / manual `refresh.yml` runs; checked in `proxy.ts`. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Yes (production) | Upstash Redis REST endpoint + token. Without them, falls back to `data/kv/*.json` on disk. |

**Local `.env.local` example:**
```bash
GITHUB_TOKEN=ghp_your_read_only_token_here
ADMIN_PASSWORD=your-local-admin-password
# Leave KV vars empty to use disk cache (data/kv/*.json)
# KV_REST_API_URL=
# KV_REST_API_TOKEN=
# GITHUB_CLIENT_ID=ADMIN   # local-only bypass, see app/api/auth/github/route.ts — never works in production
```

---

## 14. Design System

*(Unchanged from prior documentation — still accurate.)*

### Color Palette

| Role | Tailwind Class |
|---|---|
| Page background | `bg-[#0d0d14]` |
| Card fill | `bg-white/[0.025]` to `bg-white/[0.05]` |
| Card border | `border-white/[0.07]` to `border-white/[0.1]` |
| Primary accent | `purple-400` / `purple-600` |
| Secondary accent | `blue-400` / `blue-600` |
| Success / Merged | `emerald-400` / `emerald-500` |
| Open / Active | `teal-400` / `teal-500` |
| Closed / Error | `red-400` / `red-500` |
| Hall of Fame gold | `yellow-400` / `yellow-500` |

### Typography

Geist (sans, body/UI) + Geist Mono (code, repo names, PR numbers, tabular stats), via `--font-geist-sans` / `--font-geist-mono`.

### Layout

- Detail pages: `max-w-4xl mx-auto px-4`
- List pages: `max-w-6xl mx-auto px-4`
- Home sections: `max-w-3xl mx-auto px-4`
- Nav height: 52px (inline style, not Tailwind, to survive purging)

### Background Glow Pattern

Every hero uses a `pointer-events-none aria-hidden` low-opacity blurred glow (`/8` opacity), color-tinted per page.

---

## 15. Known Behaviours & Gotchas

### Turbopack FATAL Errors in Dev Mode

`npm run dev` shows recurring `FATAL: An unexpected Turbopack error` messages. Harmless — pages still serve HTTP 200. Triggered by Server Components importing Node's `fs` module (`lib/kv.ts` and friends). `npm run build` / `npm start` are unaffected.

### A Zero-Stat Card Doesn't Mean Zero Contributions

If a student has never been successfully refreshed (never-cached, or the last write was silently rejected), their leaderboard card shows an all-zero placeholder — **indistinguishable from a genuine zero contributor** without checking `profile_cache` directly. If you suspect this, the fix is a manual refresh (`POST /api/refresh?username=X`), not editing any JSON file.

### Two Independent Cache Layers Can Disagree Temporarily

A student's profile page can show fresher data than their leaderboard card, or vice versa, because `profile_cache` and `summary_cache` are updated on different schedules (see Section 5). This is expected, not a bug — the incremental cron patches summary caches for whichever students it just touched, not the whole roster.

### GitHub's Search API Rejects Multi-Author OR Queries

Despite documentation suggesting up to 5 `AND`/`OR`/`NOT` operators are allowed, a query like `author:a OR author:b` returns `422 Validation Failed` right now, verified against well-known accounts. Don't reintroduce multi-author OR batching without re-verifying this against GitHub's live behavior first — it's what caused the Generation 2 refresh mechanism to silently fail (Section 5.4).

### `kvSet` Failures Are Now Visible, Not Silent

Previously, any KV write rejection (e.g. hitting the 10MB request-size limit) was swallowed entirely — the app would report success while writing nothing. `kvSet()` now returns whether the write actually succeeded, and `writeProfileCache()` throws if it didn't, so callers can react instead of silently losing data.

### Adding a Student Has a Delay (and Requires the Right Method)

New students added via the admin dashboard or an approved join request won't appear with real stats on the leaderboard until:
1. Someone visits their profile directly (`/contributors/<username>` — builds `profile_cache` on first visit), or
2. The incremental cron reaches them in its round-robin (could take a while — see Section 5.4), or
3. Someone clicks the public Refresh button on their profile.

Editing `data/students.json` does **not** add them to the live site (see Section 4).

### The `pull_request.merged_at` Field

GitHub's Search API for issues/PRs includes a `pull_request` sub-object with `merged_at` directly in the search response — no separate API call needed to check merge status.

---

## 16. Contributor Guide

### Running Locally

```bash
npm install
# .env.local — see Section 13
npm run dev        # → http://localhost:3000
npm run build      # catches TypeScript + compilation errors — do this before every deploy
npx tsc --noEmit   # type-check only
```

**Always run `npm run build` locally before deploying.** A missing import once shipped silently and failed every production deployment for days without an obvious error in Vercel's dashboard — `npm run build` catches this immediately and costs nothing.

### Adding a New Student

Do **not** edit `data/students.json` and expect it to work (see Section 4). Instead:
- Use the admin dashboard's "Add Student" form (`POST /api/admin/students`), or
- Have the student submit via `/join`, then approve their request from the admin queue.

### Adding a Hall of Fame Entry / Event

Use the admin dashboard (`/api/admin/achievers`, `/api/admin/events`). The JSON files in `data/` only matter for a fresh KV instance that's never been seeded.

### Adding an Achievement Badge

In `app/contributors/[username]/page.tsx`, extend the badge-computation logic with your new condition, emoji, and description — follow the existing badges as a template.

### Adding a New Common Issue

In `app/issues/page.tsx`, add an entry to the `ISSUES` array — see existing entries for the shape (title, severity, whatHappened, whyItHappens, solution steps, preventionTip).

### Modifying the Caching Logic

Before touching `lib/kv.ts`, `lib/profile-cache.ts`, or `lib/summary-cache.ts`:
1. Read Section 5 completely.
2. Test both with and without KV env vars set (disk fallback vs. real Upstash).
3. Remember `kvSet()` can fail (10MB limit) — check its return value or let `writeProfileCache`'s throw propagate; don't silently swallow it again.
4. Changing a cache key format orphans existing data — nothing cleans up old keys automatically.

### Quick File Reference

| Goal | File to Edit |
|---|---|
| Add a student | Admin dashboard, **not** `data/students.json` (see Section 4) |
| Add an achiever / event | Admin dashboard (`/api/admin/achievers` / `/api/admin/events`) |
| Add a program style | `lib/data.ts` → `PROGRAM_MAP` |
| Change leaderboard ranking logic | `lib/github.ts` → scoring inside `getSummaryFromCache()` / `getAllStudentSummaries()` |
| Change cache TTLs / staleness threshold | `lib/profile-cache.ts` (TTL), `lib/github.ts` → `updateStaleProfiles` (staleness) |
| Change incremental refresh frequency/batch size | `.github/workflows/refresh-cache.yml` (frequency), `lib/github.ts` → `PER_TOKEN_CANDIDATE_POOL`/`MAX_TOTAL_BATCH`/`TICK_DEADLINE_MS` (batch sizing) |
| Change admin password logic | `lib/admin-auth.ts` + `ADMIN_PASSWORD` — import `checkAdminAuth()`, don't re-implement the cookie check |
| Add navigation link | `app/components/Nav.tsx` |
| Add achievement badge | `app/contributors/[username]/page.tsx` |
| Change refresh rate limit | `app/api/refresh/route.ts` (cooldown constants) |
