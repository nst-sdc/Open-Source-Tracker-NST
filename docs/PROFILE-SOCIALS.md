# Contact links on contributor pages

Every student has a page at `/contributors/<github-username>`. The **Connect** card on it shows the contact links the student chose to share, so a maintainer, recruiter or classmate who finds them on the leaderboard can reach them.

## For students

1. Sign in with GitHub (top right).
2. Open your own page and click **Add your links** (or **Edit**) on the Connect card.
3. Fill in any of: one line about you (140 characters), LinkedIn, X, website, email, Discord, Telegram, Instagram, YouTube. Paste a URL or just the handle; both work.
4. Save. Empty fields stay hidden. **Remove all** clears the card.

Only the GitHub account that owns the page can edit it. Nobody else sees an edit button, and the card does not appear at all on pages with nothing to show.

## What is checked

Two layers, both on the server when you press Save.

**Format.** Links are normalised before they are stored, so the page never renders what was typed: LinkedIn must be a `linkedin.com/in/…` profile, X/Telegram/Instagram/YouTube become canonical profile URLs from the handle, websites must be `http(s)` with a real hostname (no credentials, fragments dropped), emails must look like emails, Discord is the username only (shown with a copy button, since Discord has no profile URL).

**Existence.** Each account is then checked with its platform, using what the platform exposes without credentials (`lib/socials-verify.ts`). A link that fails is rejected and the field says why; a link that passes is stored with the time it was confirmed and shown with a tick.

| Platform | How it is checked | If it cannot be checked |
|---|---|---|
| X | `publish.x.com/oembed` answers 200 for a real handle, 404 for none | rejected as unreachable, try again |
| YouTube | `youtube.com/@handle` answers 200 or 404 | same |
| Telegram | `t.me/handle` carries the page-title block only for a real account | same |
| Email | the domain publishes MX records | same |
| Website | resolves to a public address and answers HTTP (redirects are not followed, internal addresses are refused) | rejected |
| LinkedIn | 200 means the profile exists; 999 is LinkedIn's bot wall and proves nothing | shown without a tick |
| Instagram | answers 200 for everything (login wall) | shown without a tick |
| Discord | no public lookup | shown without a tick |

Each bad field is reported by name, and nothing is saved until every field passes.

## For admins

`GET /api/admin/socials?github=<login>` shows what a student has set; `DELETE` on the same URL clears it. Both need the admin session. There is no admin edit on purpose: the content is the student's own.

## Where it lives

- `lib/socials-shared.ts`: types, platform list, `normalizeSocials`, `socialLinks` (browser-safe, used by the card).
- `lib/socials.ts`: the store (`student_socials:<login>` in KV) plus a re-export of the above.
- `app/api/profile/socials/route.ts`: public `GET`, owner-only `PUT`/`DELETE` (same-origin check, GitHub session, 20 writes per hour per account).
- `app/contributors/[username]/SocialsCard.tsx`: the card and its inline form.
