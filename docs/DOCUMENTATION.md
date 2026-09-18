# OpenSource NST Tracker — Complete Documentation

> **Last Updated:** June 2026  
> **Stack:** Next.js 16 · React 19 · Tailwind CSS 4 · Vercel KV  
> **Repository:** `saiudayagiri/open-source-tracker-NST`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Directory Structure](#4-directory-structure)
5. [Core Library Layer](#5-core-library-layer)
6. [Caching Architecture](#6-caching-architecture)
7. [Data Flow Sequences](#7-data-flow-sequences)
8. [API Routes Reference](#8-api-routes-reference)
9. [Pages & UI Components](#9-pages--ui-components)
10. [Admin Dashboard](#10-admin-dashboard)
11. [Scoring & Ranking System](#11-scoring--ranking-system)
12. [Flagging Queue System](#12-flagging-queue-system)
13. [Authentication](#13-authentication)
14. [Environment Variables](#14-environment-variables)
15. [Deployment Guide](#15-deployment-guide)
16. [Common Issues & Troubleshooting](#16-common-issues--troubleshooting)

---

## 1. Project Overview

The **OpenSource NST Tracker** is a web platform that tracks and ranks open-source contributions made by students at NST . It:

- **Tracks** Pull Requests and Issues created by registered students across all of GitHub
- **Ranks** students on a leaderboard by their "clean" merged PRs (excluding flagged/spam ones)
- **Showcases** a Hall of Fame for students accepted into prestigious programs (GSoC, Outreachy, LFX, etc.)
- **Manages** student onboarding through a self-service join request system
- **Provides** an admin dashboard for mentors to review contributions, flag spam, and manage data

### Key Features

| Feature | Description |
|---|---|
| **Contributor Leaderboard** | Ranked by merged PRs, filterable by year, campus, time period |
| **Individual Profiles** | Detailed PR/issue/review breakdown per student |
| **Hall of Fame** | Students accepted into GSoC, Outreachy, LFX, MLH, etc. |
| **Admin Dashboard** | Manage students, achievers, events, flag PRs, approve join requests |
| **GitHub OAuth** | Login for higher API rate limits |
| **Join Request System** | Students self-register, admins approve/reject |
| **PR Flagging** | Mark spam/fake/low-quality PRs to exclude from scoring |
| **Background Sync** | Daily cron job refreshes stale profile caches |
| **Multi-Campus Support** | Filter by campus (ADYPU, Rishihood, SVYASA) and year (1st–4th) |

---

## 2. Architecture Overview

The system follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER LAYER                            │
│  FilterBar · RefreshButton · Nav · AdminDashboardClient         │
│  (Client Components — React with URL-based state)               │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP / Server Actions
┌────────────────────────▼────────────────────────────────────────┐
│                    NEXT.JS SERVER PAGES                          │
│  /  ·  /contributors  ·  /contributors/[user]  ·  /achievers   │
│  /programs  ·  /join  ·  /admin  ·  /check-work  ·  /issues    │
│  (Server-Side Rendered — async React Server Components)         │
└────────────────────────┬────────────────────────────────────────┘
                         │ Function calls
┌────────────────────────▼────────────────────────────────────────┐
│                       API ROUTES                                │
│  /api/refresh  ·  /api/refresh/incremental  ·  /api/admin/*    │
│  /api/auth/github  ·  /api/join-requests                       │
│  (Next.js Route Handlers — POST/GET endpoints)                  │
└────────────────────────┬────────────────────────────────────────┘
                         │ Function calls
┌────────────────────────▼────────────────────────────────────────┐
│                      LIB LAYER                                  │
│  github.ts · summary-cache.ts · profile-cache.ts · flagged.ts  │
│  kv.ts · kv-students.ts · kv-achievers.ts · kv-events.ts       │
│  (Core business logic — TypeScript modules)                     │
└──────┬─────────────────────────────────────────────┬────────────┘
       │                                             │
┌──────▼──────────┐                      ┌───────────▼────────────┐
│  DATA STORAGE   │                      │    EXTERNAL APIS       │
│  ─────────────  │                      │    ────────────────     │
│  Vercel KV      │                      │    GitHub REST API     │
│  (Redis) in     │                      │    (Search, Profiles)  │
│  production     │                      │                        │
│                 │                      │    GitHub OAuth        │
│  data/kv/*.json │                      │    (Login flow)        │
│  (Local disk    │                      │                        │
│  fallback)      │                      │    Vercel Cron         │
│                 │                      │    (Daily at 2 AM)     │
└─────────────────┘                      └────────────────────────┘
```

### Design Principles

1. **Cache-first loading** — Pages load from pre-computed caches, never blocking on GitHub API
2. **Graceful degradation** — If GitHub API is down, stale caches serve as fallback
3. **KV abstraction** — Single `lib/kv.ts` module works with both Vercel KV (prod) and local files (dev)
4. **Seed-on-first-read** — KV data is seeded from `data/*.json` files on first access
5. **Rate-limit resilience** — Batch queries, retries with 65s cooldown, OAuth for higher limits

---

## 3. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router) | 16.2.4 |
| **UI Library** | React | 19.2.4 |
| **Styling** | Tailwind CSS | 4.x |
| **Language** | TypeScript | 5.x |
| **Smooth Scroll** | Lenis | 1.3.23 |
| **KV Store (Prod)** | Vercel KV (Redis) | — |
| **KV Store (Dev)** | Local JSON files | — |
| **Hosting** | Vercel | — |
| **API** | GitHub REST API v3 | — |
| **Auth** | GitHub OAuth 2.0 | — |

---

## 4. Directory Structure

```
OpenSource_NST_Tracker/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Home page (/)
│   ├── layout.tsx                # Root layout (Nav, global styles)
│   ├── globals.css               # Global CSS + Tailwind directives
│   │
│   ├── contributors/
│   │   ├── page.tsx              # Leaderboard (/contributors)
│   │   ├── FilterBar.tsx         # Client: search, year, campus, period filters
│   │   ├── RefreshButton.tsx     # Client: cache refresh trigger
│   │   └── [username]/
│   │       └── page.tsx          # Profile detail (/contributors/[user])
│   │
│   ├── achievers/
│   │   ├── page.tsx              # Hall of Fame (/achievers)
│   │   └── [username]/
│   │       └── page.tsx          # Achiever profile (/achievers/[user])
│   │
│   ├── admin/
│   │   ├── page.tsx              # Admin login
│   │   └── dashboard/
│   │       ├── page.tsx          # Dashboard page wrapper
│   │       └── AdminDashboardClient.tsx  # Full admin panel (client)
│   │
│   ├── join/page.tsx             # Join request form
│   ├── login/page.tsx            # GitHub OAuth login
│   ├── programs/page.tsx         # OS program directory
│   ├── get-started/page.tsx      # Onboarding guide
│   ├── check-work/               # PR checker tool
│   ├── issues/page.tsx           # Issues explorer
│   ├── repo-activity/page.tsx    # Repo activity dashboard
│   │
│   ├── components/               # Shared UI components
│   │   ├── Nav.tsx               # Navigation bar
│   │   ├── UpcomingEvents.tsx    # Events timeline widget
│   │   ├── FloatingCelebration.tsx  # Achievement animations
│   │   └── SmoothScroll.tsx      # Lenis scroll wrapper
│   │
│   └── api/                      # API Route Handlers
│       ├── refresh/
│       │   ├── route.ts          # Public cache refresh
│       │   └── incremental/
│       │       └── route.ts      # Cron background sync
│       ├── auth/
│       │   ├── github/           # OAuth start
│       │   │   ├── route.ts
│       │   │   └── callback/route.ts  # OAuth callback
│       │   ├── session/route.ts  # Session check
│       │   └── logout/route.ts   # Logout
│       ├── admin/
│       │   ├── auth/route.ts     # Admin login
│       │   ├── students/route.ts # Student CRUD
│       │   ├── achievers/route.ts # Achiever CRUD
│       │   ├── events/route.ts   # Event CRUD
│       │   ├── flag/route.ts     # PR flagging
│       │   ├── approve/route.ts  # Join request approval
│       │   └── join-requests/route.ts  # Join request review
│       ├── join-requests/route.ts  # Public submission
│       ├── repo-activity/route.ts
│       ├── user-activity/route.ts
│       └── weekly-contributors/route.ts
│
├── lib/                          # Core business logic
│   ├── github.ts                 # GitHub API integration (25KB — the core)
│   ├── kv.ts                     # Universal KV adapter
│   ├── profile-cache.ts          # Per-user profile + PRs cache
│   ├── summary-cache.ts          # Leaderboard snapshot cache
│   ├── kv-students.ts            # Student list CRUD
│   ├── kv-achievers.ts           # Achiever list CRUD
│   ├── kv-events.ts              # Events CRUD
│   ├── kv-join-requests.ts       # Join request CRUD
│   ├── flagged.ts                # PR flagging system
│   ├── reviewed.ts               # PR review tracking
│   ├── admin-auth.ts             # Admin session check
│   ├── data.ts                   # Static data helpers + program styling
│   └── types.ts                  # Shared TypeScript types
│
├── data/                         # Seed data + local KV fallback
│   ├── students.json             # Student list (~800 entries)
│   ├── achievers.json            # Hall of Fame entries
│   ├── events.json               # Upcoming events
│   ├── flagged_prs.json          # Flagged PRs
│   ├── reviewed_prs.json         # Reviewed PRs
│   └── kv/                       # Local KV disk fallback
│       ├── students_list.json
│       ├── achievers_list.json
│       ├── profile_cache_*.json  # Per-student caches
│       └── summary_cache_*.json  # Leaderboard snapshots
│
├── next.config.ts                # Next.js config (image domains)
├── package.json                  # Dependencies
├── .env.local                    # Environment variables (secrets)
└── docs/
    ├── DOCUMENTATION.md          # This file
    └── architecture.html         # Interactive architecture diagram
```

---

## 5. Core Library Layer

### 5.1 `lib/kv.ts` — Universal KV Adapter

The foundation of all data persistence. Provides `kvGet<T>(key)` and `kvSet<T>(key, value, ttl?)`.

**Dual-mode operation:**
- **Production (Vercel):** Sends Redis commands to Vercel KV via REST API
- **Development (local):** Reads/writes JSON files in `data/kv/`

```
kvGet("students_list")
  ├── [Vercel KV exists?] → POST to KV_REST_API_URL with ["GET", key]
  └── [No KV?]            → Read data/kv/students_list.json
```

**File format (disk fallback):**
```json
{
  "value": [...],           // The actual stored data
  "expiresAt": 1719388800  // Unix ms timestamp, or null for no expiry
}
```

### 5.2 `lib/github.ts` — GitHub API Core (25KB)

The largest and most critical module. Handles:

| Function | Purpose |
|---|---|
| `getGitHubHeaders()` | Returns auth headers (OAuth cookie → system token fallback) |
| `githubSearch<T>(query)` | Single-page GitHub Search API call |
| `githubSearchAll<T>(query)` | Paginated search (up to 10 pages with token, 3 without) |
| `getStudentProfile(user)` | Fetch `/users/{username}` |
| `getStudentPRs(user)` | Fetch all PRs authored by user (excluding own repos) |
| `getStudentIssues(user)` | Fetch all issues authored by user |
| `getStudentReviews(user)` | Fetch PRs reviewed by user |
| `getStudentSummary(student)` | Full summary for one student (cache-first) |
| `getAllStudentSummaries(dateQuery)` | Leaderboard data for all students |
| `refreshStudentCache(user)` | Force-refresh one student's profile cache |
| `updateStaleProfiles(batchSize)` | Find and refresh the N stalest profiles |
| `buildDateQuery(period)` | Convert period string to GitHub `created:>date` query |

**Batch Query Strategy:**
- Students are grouped into batches of 15
- Query: `is:pr author:user1 author:user2 ... author:user15`
- Each batch waits 1.5s (with token) or 6.5s (without) before the next
- On rate limit (403/429): waits 65s and retries once

### 5.3 `lib/profile-cache.ts` — Per-Student Cache

Stores a complete snapshot of a student's GitHub data:

```typescript
interface ProfileCacheEntry {
  cachedAt: string;         // ISO timestamp
  profile: GitHubUser;      // GitHub profile (name, avatar, bio, etc.)
  prs: StudentPR[];         // All PRs (with merged_at, state, labels)
  issues: StudentIssue[];   // All issues
}
```

- **KV Key:** `profile_cache:{username}` (lowercased)
- **Physical TTL:** 30 days
- **Freshness TTL:** 1 hour (for deciding whether to re-fetch)

### 5.4 `lib/summary-cache.ts` — Leaderboard Cache

Pre-computed leaderboard snapshots to avoid reprocessing 800+ students:

```typescript
interface SummaryCache {
  cachedAt: string;
  summaries: StudentSummary[];  // Sorted by scoreMergedPRs desc
}
```

- **KV Key:** `summary_cache:{period}` (e.g., `summary_cache:all`, `summary_cache:week`)
- **TTL:** 24 hours
- **Refresh cooldown:** 5 minutes between public refreshes
- **Invalidation:** `invalidateSummaryCache()` sets all timestamps to epoch (1970)

### 5.5 `lib/kv-students.ts` — Student Management

```typescript
interface Student {
  github: string;
  year?: '1st year' | '2nd year' | '3rd year' | '4th year';
  campus?: 'Rishihood' | 'ADYPU' | 'SVYASA';
}
```

- **KV Key:** `students_list`
- **Seed file:** `data/students.json`
- **Functions:** `getStudentsKV()`, `addStudent()`, `removeStudent()`, `updateStudentDetails()`

### 5.6 `lib/flagged.ts` — PR Flagging

```typescript
interface FlaggedPR {
  id: string;        // "owner/repo#number"
  url: string;       // PR HTML URL
  title: string;     // PR title
  author: string;    // GitHub username
  reason: 'fake' | 'self_pr' | 'low_quality';
  flaggedAt: string; // ISO timestamp
  note?: string;     // Admin note
}
```

- **KV Key:** `flagged_prs`
- **Impact:** Flagged merged PRs are subtracted from `scoreMergedPRs` in ranking

---

## 6. Caching Architecture

The system uses **3 caching layers** to minimize GitHub API calls:

```
                     ┌─────────────────────────┐
                     │    SUMMARY CACHE         │
                     │    ──────────────         │
                     │    Pre-computed           │
  Page Load ──────►  │    leaderboard per       │ ──► Instant render
  (first check)      │    time period           │     (no API calls)
                     │    TTL: 24h              │
                     │    Cooldown: 5min        │
                     └────────┬────────────────┘
                              │ (miss or stale)
                     ┌────────▼────────────────┐
                     │    PROFILE CACHE         │
                     │    ─────────────         │
                     │    Per-student:          │
  Rebuild from ───►  │    profile + PRs +       │ ──► Rebuild summary
  profile caches     │    issues               │     (still no API calls)
                     │    TTL: 30 days         │
                     │    Fresh: 1 hour        │
                     └────────┬────────────────┘
                              │ (miss — no cache exists)
                     ┌────────▼────────────────┐
                     │    GITHUB API            │
                     │    ──────────            │
  Live fetch ─────►  │    Search Issues/PRs     │ ──► Write to profile
  (only when no      │    User Profile          │     cache + summary
  cache exists)      │    Rate: 30 req/min     │     cache
                     └─────────────────────────┘
```

### Cache Lifecycle

1. **First deployment:** No caches exist. Students get placeholder cards. Cron job starts populating.
2. **Daily cron (2 AM):** Updates 5 stalest profiles from GitHub, rebuilds summaries.
3. **Manual refresh:** User clicks "Refresh" → rebuilds summary from existing profile caches (no GitHub calls).
4. **Individual refresh:** User refreshes one profile → live GitHub fetch → updates profile + summary caches.

---

## 7. Data Flow Sequences

### 7.1 Page Load (`/contributors`)

```
Browser → Server renders ContributorsPage
  1. getStudentsKV()          → Read students_list from KV
  2. readSummaryCache(period) → Check for pre-computed leaderboard
     ├── [Cache fresh] → Use cached summaries, skip to step 5
     └── [Cache stale/missing] → Continue to step 3
  3. getAllStudentSummaries()  → For each student:
     ├── readProfileCache(user) → [Cached] → Compute summary locally
     └── [Not cached] → Return placeholder (0 PRs, avatar URL from GitHub)
  4. writeSummaryCache()      → Store computed leaderboard
  5. Apply filters (search, year, campus)
  6. Render HTML grid → Send to browser
```

### 7.2 Refresh Button Click

```
Browser → POST /api/refresh?period=all
  1. readSummaryCache("all") → Check freshness
     ├── [< 5 min old] → Return "try again in Xs"
     └── [> 5 min old] → Continue
  2. getAllStudentSummaries() → Build from profile caches (0 GitHub calls)
  3. writeSummaryCache()     → Store updated leaderboard
  4. revalidatePath("/contributors") → Tell Next.js to re-render
  5. Return { ok: true } → Client calls router.refresh()
```

### 7.3 Individual Profile Refresh

```
Browser → POST /api/refresh?username=xyz
  1. Check profile cache age → [< 5 min] → Return "try again"
  2. getStudentProfile("xyz")  → Live GitHub API call
  3. getStudentPRs("xyz")      → Live GitHub API call
  4. getStudentIssues("xyz")   → Live GitHub API call
  5. writeProfileCache()       → Store fresh data
  6. Rebuild summary caches for all/week/month periods
  7. revalidatePath("/contributors/xyz")
```

### 7.4 Daily Cron Job (2 AM)

```
Vercel Cron → POST /api/refresh/incremental
  1. Read all profile caches → Sort by cachedAt (oldest first)
  2. Take 5 oldest (or uncached) students
  3. For each student:
     a. getStudentProfile()  → GitHub API
     b. getStudentPRs()      → GitHub API
     c. getStudentIssues()   → GitHub API
     d. writeProfileCache()  → Store in KV
     e. Wait 1.5s (rate limit spacing)
  4. Rebuild summary caches for all/week/month
  5. revalidatePath("/contributors"), revalidatePath("/")
```

### 7.5 Student Join Request Flow

```
Student → /join page → Fill form (github, year, campus)
  1. POST /api/join-requests → Validates & stores as "pending"
  2. Admin sees in dashboard → /admin/dashboard (Join Requests tab)
  3. Admin clicks "Approve" → POST /api/admin/approve
     a. addStudent(github, year, campus) → Adds to students_list KV
     b. updateJoinRequestStatus(github, "approved")
  4. Student appears on leaderboard (placeholder until cache builds)
```

---

## 8. API Routes Reference

### Public Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/refresh` | Cache metadata (age, count, freshness) |
| `POST` | `/api/refresh` | Trigger summary cache refresh (5 min cooldown). `?username=x` for individual |
| `POST` | `/api/refresh/incremental` | Cron: update 5 stalest profiles |
| `GET` | `/api/auth/github` | Start GitHub OAuth flow |
| `GET` | `/api/auth/github/callback` | OAuth callback → exchange code for token |
| `GET` | `/api/auth/session` | Current user session info |
| `POST` | `/api/auth/logout` | Clear OAuth cookie |
| `POST` | `/api/join-requests` | Submit join request |
| `GET` | `/api/repo-activity` | Repository activity data |
| `GET` | `/api/user-activity` | User timeline data |
| `GET` | `/api/weekly-contributors` | Weekly contribution stats |

### Admin Endpoints (require `admin_session` cookie)

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/admin/auth` | Admin login (password check) |
| `GET` | `/api/admin/students` | List all students |
| `POST` | `/api/admin/students` | Add student |
| `DELETE` | `/api/admin/students` | Remove student |
| `GET` | `/api/admin/achievers` | List all achievers |
| `POST` | `/api/admin/achievers` | Add achiever |
| `PATCH` | `/api/admin/achievers` | Update achiever |
| `DELETE` | `/api/admin/achievers` | Remove achiever |
| `GET` | `/api/admin/events` | List events |
| `POST` | `/api/admin/events` | Add event |
| `PATCH` | `/api/admin/events` | Update event |
| `DELETE` | `/api/admin/events` | Remove event |
| `POST` | `/api/admin/flag` | Flag a PR |
| `DELETE` | `/api/admin/flag` | Unflag a PR |
| `GET` | `/api/admin/join-requests` | List join requests |
| `PATCH` | `/api/admin/join-requests` | Update request status |
| `POST` | `/api/admin/approve` | Approve request → add to students |

---

## 9. Pages & UI Components

### 9.1 Page Map

| Route | Type | Description |
|---|---|---|
| `/` | SSR | Landing page — hero, stats, top contributors, events |
| `/contributors` | SSR | Leaderboard — search, filter by year/campus/period |
| `/contributors/[user]` | SSR | Profile — PRs, issues, reviews, badges |
| `/achievers` | SSR | Hall of Fame — program badges |
| `/achievers/[user]` | SSR | Achiever profile |
| `/programs` | SSR | Open source program directory |
| `/get-started` | SSR | Onboarding guide |
| `/join` | SSR + Client | Join request form |
| `/login` | SSR | GitHub OAuth login |
| `/check-work` | SSR | PR checker tool |
| `/issues` | SSR | Issues explorer |
| `/repo-activity` | SSR | Repo activity dashboard |
| `/admin` | SSR + Client | Admin login |
| `/admin/dashboard` | SSR + Client | Full admin panel |

### 9.2 Client Components

| Component | Location | Purpose |
|---|---|---|
| `FilterBar` | `app/contributors/FilterBar.tsx` | Search + year/campus dropdowns + time period pills |
| `RefreshButton` | `app/contributors/RefreshButton.tsx` | Cache refresh with cooldown |
| `Nav` | `app/components/Nav.tsx` | Global navbar + mobile menu + session |
| `UpcomingEvents` | `app/components/UpcomingEvents.tsx` | Events timeline on homepage |
| `FloatingCelebration` | `app/components/FloatingCelebration.tsx` | Achievement animations |
| `SmoothScroll` | `app/components/SmoothScroll.tsx` | Lenis smooth scroll |
| `AdminDashboardClient` | `app/admin/dashboard/` | Full admin panel |

---

## 10. Admin Dashboard

Accessible at `/admin` → requires `ADMIN_PASSWORD` to login.

### Dashboard Tabs

| Tab | Functions |
|---|---|
| **Queue** | Review pending PRs, mark as reviewed, flag suspicious ones |
| **Browse** | View all student contributions, search, explore |
| **Flagged** | See all flagged PRs, unflag if needed |
| **Students** | Add/remove students, update year/campus |
| **Events** | Add/edit/delete upcoming events |
| **Achievers** | Manage Hall of Fame entries |
| **Join Requests** | Approve/reject student join requests |

### Admin Auth Flow
1. User enters admin password on `/admin`
2. `POST /api/admin/auth` → verifies against `ADMIN_PASSWORD` env var
3. Sets `admin_session=authenticated` cookie
4. Redirects to `/admin/dashboard`
5. All `/api/admin/*` routes check this cookie via `checkAdminAuth()`

---

## 11. Scoring & Ranking System

### Current Scoring Formula

```
scoreMergedPRs = mergedPRs - flaggedMergedPRs
```

- **mergedPRs:** Count of PRs with `pull_request.merged_at` set
- **flaggedMergedPRs:** Merged PRs that exist in the flagged list
- Only PRs to **other people's repos** count (PRs to own repos are excluded via `is:pr author:user -user:user`)
- Leaderboard is sorted by `scoreMergedPRs` in descending order

### What Counts as a PR

- Must be authored by the student (`author:{username}`)
- Must be in a repo **not owned** by the student (`-user:{username}`)
- Can be in any state: open, merged, or closed
- Only merged PRs affect the ranking score

### PR Exclusion Rules

1. **Self-PRs:** PRs to repos owned by the student are excluded from search
2. **Flagged PRs:** Admins can flag PRs as `fake`, `self_pr`, or `low_quality`
3. Flagged PRs still appear in the profile but don't count toward the score

---

## 12. Flagging Queue System

### How Flagging Works

1. **Admin reviews PRs** in the admin dashboard (Queue or Browse tab)
2. **Admin flags a PR** with a reason: `fake`, `self_pr`, or `low_quality`
3. **System stores the flag** in `flagged_prs` KV list:
   ```json
   {
     "id": "owner/repo#42",
     "url": "https://github.com/owner/repo/pull/42",
     "title": "Added feature X",
     "author": "student-username",
     "reason": "low_quality",
     "flaggedAt": "2026-06-25T10:30:00.000Z",
     "note": "Trivial change to README"
   }
   ```
4. **Summary caches are invalidated** (all periods set to epoch timestamp)
5. **Next page load** rebuilds summaries with the flagged PR excluded from scoring:
   ```
   scoreMergedPRs = mergedPRs - count(flagged merged PRs)
   ```

### Flag Categories

| Flag | Meaning |
|---|---|
| `fake` | PR was created solely to game the system (empty changes, meaningless commits) |
| `self_pr` | PR was made to the student's own repo or a repo they control |
| `low_quality` | PR has trivial changes that don't represent meaningful contribution |

### Unflagging

Admins can unflag PRs from the "Flagged" tab, which:
1. Removes the entry from `flagged_prs` KV list
2. Invalidates summary caches
3. The PR's score contribution is restored on next page load

---

## 13. Authentication

### 13.1 GitHub OAuth (User Login)

**Purpose:** Higher GitHub API rate limits (30 searches/min vs 10/min unauthenticated).

**Flow:**
1. User clicks "Login with GitHub" → `GET /api/auth/github`
2. Redirect to `https://github.com/login/oauth/authorize?client_id=...`
3. GitHub redirects to `GET /api/auth/github/callback?code=...`
4. Server exchanges code for access token
5. Token stored in `github_oauth_token` cookie
6. `getGitHubHeaders()` checks cookie first, falls back to system `GITHUB_TOKEN`

### 13.2 Admin Authentication

**Purpose:** Protect admin dashboard and API routes.

**Flow:**
1. Admin enters password on `/admin` page
2. `POST /api/admin/auth` → checks against `ADMIN_PASSWORD` env var
3. Sets `admin_session=authenticated` cookie
4. All `/api/admin/*` routes call `checkAdminAuth()` → reads cookie

---

## 14. Environment Variables

Required in `.env.local`:

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token for API calls |
| `ADMIN_PASSWORD` | Yes | Password for admin dashboard login |
| `GITHUB_CLIENT_ID` | For OAuth | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | For OAuth | GitHub OAuth App client secret |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID` | For OAuth | Client-side GitHub client ID |
| `KV_REST_API_URL` | For Prod | Vercel KV REST API URL |
| `KV_REST_API_TOKEN` | For Prod | Vercel KV REST API token |

**Token fallback chain:**
1. `github_oauth_token` cookie (user's OAuth token)
2. `GITHUB_TOKEN` env var (system token)
3. `gh auth token` CLI command (dev convenience)
4. Unauthenticated (lowest rate limits)

---

## 15. Deployment Guide

### Vercel Deployment

1. **Connect repo** to Vercel dashboard
2. **Set Root Directory** to the project root (where `package.json` lives)
3. **Framework Preset:** Next.js (auto-detected)
4. **Add environment variables** (see section 14)
5. **Deploy** — Vercel builds with `next build`

### Important: Root Directory Setting

If you get the error _"Could not find a valid `app` or `pages` directory"_, your Vercel **Root Directory** setting is wrong. Go to:

**Vercel Dashboard → Project → Settings → General → Root Directory**

Set it to the folder that contains your `app/` directory and `package.json`.

### Vercel KV Setup

1. Go to Vercel Dashboard → Storage → Create KV Database
2. Connect it to your project
3. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are auto-injected

### Cron Job

Defined in `k8s/05-refresh-cronjob.yaml`, running in the cluster:

```yaml
schedule: "*/15 * * * *"
```

A CronJob calls `POST /api/refresh/incremental` against the in-cluster Service
every 15 minutes. There is deliberately no Vercel cron: two schedulers sharing
one GitHub token would compete for the same rate limit.

---

## 16. Common Issues & Troubleshooting

### "Contributors page takes forever to load"

**Cause:** No summary cache exists, and the system tries to fetch all 800+ students from GitHub.

**Fix:** The system now uses a **placeholder strategy** — uncached students show as cards with 0 PRs while data fetches in the background. Run the cron job or manually trigger `POST /api/refresh/incremental` to populate caches.

### "Vercel build: Could not find app or pages directory"

**Cause:** Root Directory setting in Vercel is pointing to the wrong folder.

**Fix:** Set Root Directory in Vercel Settings → General to the folder containing `package.json` and the `app/` directory.

### "Changes to achievers.json don't show up"

**Cause:** KV cache has stale data. The JSON file is only used to **seed** KV on first read.

**Fix:** Delete `data/kv/achievers_list.json` (local) or clear the `achievers_list` key in Vercel KV.

### "GitHub API rate limit exceeded"

**Cause:** Too many search queries in a short time (limit: 30/min authenticated, 10/min unauthenticated).

**Fix:**
- Ensure `GITHUB_TOKEN` is set in `.env.local`
- Use GitHub OAuth login for higher limits
- The system auto-retries with 65s cooldown on rate limits

### "Profile data is stale"

**Cause:** Profile cache is older than 1 hour (freshness TTL) but physical cache hasn't expired.

**Fix:** Use the "Refresh" button on the individual profile page, or trigger `POST /api/refresh?username=xyz`.

---

## Interactive Architecture Diagram

For an interactive visual diagram with hover tooltips, open:

**[`docs/architecture.html`](./architecture.html)**

Open it in any browser to explore the full architecture with clickable components, data flow tables, and a complete file map.
