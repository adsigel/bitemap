# Bitemap — Development Plan

## Concept

Users tap on sandwich photos to indicate where they'd take the next bite. Bite coordinates are aggregated and visualized as heatmaps. Users can see whether their bite placement is typical or unique compared to the crowd, expressed as a **Bitemark** score (higher = more unique).

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR, server actions, API routes |
| Database | Supabase (Postgres) | Managed Postgres + auth + image storage |
| Auth | Supabase Auth (Google OAuth) | Anonymous sessions by default, upgrade to account |
| Image storage | Supabase Storage | Signed upload URLs from client |
| ORM | Supabase JS client (direct) | Lightweight for this schema |
| Styling | Tailwind CSS | |
| Bite UI | HTML Canvas (Canvas 2D) | Tap-to-place interaction + heatmap overlay |
| Email | Resend | Transactional notifications (domain: bitemap.food) |
| Analytics | Amplitude | Browser SDK (client) + HTTP API (server) |
| Hosting | Vercel | |

---

## Data Model

### `sandwiches`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| title | text | e.g. "Italian Sub" |
| description | text | optional |
| image_url | text | Supabase Storage public URL |
| uploaded_by | uuid | FK → auth.users; null = admin seed |
| approved | bool | false = pending review |
| created_at | timestamptz | |

### `bites`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| sandwich_id | uuid | FK → sandwiches |
| x | float | 0.0–1.0, relative to image width |
| y | float | 0.0–1.0, relative to image height |
| user_id | uuid | null = anonymous |
| session_id | text | for anonymous dedup |
| created_at | timestamptz | |

Coordinates are stored as percentages (0–1) so they're display-size-agnostic.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, FK → auth.users |
| display_name | text | editable by user |
| avatar_url | text | from Google OAuth |
| created_at | timestamptz | |

---

## Feature Scope

### MVP
- [X] Admin sandwich seeding (manual upload via admin route)
- [X] Sandwich listing page — grid of approved sandwiches
- [X] Sandwich detail page — view image, tap to place a bite
- [X] Bite submission — store coordinate to DB, one bite per sandwich per session
- [X] Heatmap overlay — show aggregated bite distribution after submission
- [X] Bitemark score — uniqueness percentile shown after biting

### Phase 2
- [X] User accounts — Google OAuth, anonymous → account upgrade nudge
- [X] Profile page — bite stats, Bitemark average, submitted sandwiches
- [X] User-submitted sandwiches — upload photo + title, pending admin approval
- [X] Sandwich moderation queue — approve, reject, rename
- [X] Upload attribution — submitted sandwiches linked to uploader profile
- [X] Share image — generates a JPEG with heatmap overlay + watermark for sharing
- [ ] Bite breakdown by region (crust vs. middle, left vs. right)
- [ ] Leaderboard / most-bitten sandwiches

---

## Bitemark Score

1. Compute centroid of all bites for a sandwich
2. Calculate each bite's Euclidean distance from the centroid
3. Count how many other biters are *more central* than the user (closer to centroid)
4. Bitemark = `moreCentralCount / totalBiters * 100` — higher means more unique

Labels: `> 66` → "Such a unique spot for a bite! 🦄" / `> 33` → "A pretty distinctive bite spot 👍" / else → "That's a popular bite spot 🎯"

Shown on sandwich detail after biting, and averaged across all bites on the profile page.

---

## Page Structure

```
/                  → sandwich grid (approved, most-bitten first)
/sandwich/[id]     → detail: image + bite UI + heatmap + Bitemark score
/upload            → user sandwich submission form
/admin/review      → moderation queue: approve, reject, rename
/profile           → user stats, submitted sandwiches, display name editor
/sign-in           → Google OAuth sign-in
/privacy           → privacy policy
/tos               → terms of service
```

---

## Email Notifications (Resend)

All sent from `hello@bitemap.food`.

| Trigger | Recipient | Subject |
|---|---|---|
| New sandwich submitted | Admin (hello@bitemap.food) | "New sando needs review: {title}" |
| Sandwich approved | Uploader | "Your sandwich was approved! 🥪" |
| Sandwich hits 5 bites | Uploader | "Your sando just hit 5 bites 🥪" |
| User takes their 10th bite | Biter | "You've taken your 10th bite! 🎉" |

Milestone emails only fire for logged-in users (anonymous users have no email). `User Notified` Amplitude event fires alongside each milestone email.

---

## Amplitude Tracking

| Event | Where | Notes |
|---|---|---|
| Bite Taken | BiteCanvas (client) | sandwich_id, x, y, percentile, total_bites |
| Bite Moved | BiteCanvas (client) | sandwich_id |
| Sandwich Shared | BiteCanvas (client) | sandwich_id, method (native_share / download) |
| Account Created | Auth callback → client | fires once on first login |
| Profile Viewed | Profile page (client) | fires on mount |
| Username Edited | DisplayNameEditor (client) | fires after successful save |
| User Notified | sandwich-actions (server) | notification: "10th Bite" or "5th Sandwich Bite" |

Server-side events use the Amplitude HTTP API directly (no Node SDK) via `src/lib/track-server.ts`.

---

## Backlog

- **Gamification** — badges (e.g. "First Biter", "Outlier", "Century Club"), leaderboards by Bitemark score or bite count
- **More bite milestones** — 25, 50, 100 bites on a sandwich; notify uploader
- **Sandwich deletion** — let the submitter delete their own sandwich (with confirmation); admin can delete any
- **Email engagement** — periodic digest or re-engagement emails for dormant users

---

## Known Issues / Future Work

### Out-of-bounds bite detection
Users occasionally place bites outside the sandwich itself — on hands, plates, backgrounds, etc. Ideas for addressing this:

- **Soft warning**: If a bite lands far from the existing bite cluster centroid (e.g. >2 std deviations), show a gentle nudge: "That looks like it might be outside the sandwich — are you sure?" with a confirm/move option.
- **Upload-time bite zone**: Let sandwich submitters draw a rough bounding polygon on the image during upload. Bites outside the polygon trigger a warning.
- **ML segmentation**: Use a vision model to auto-detect the sandwich region and validate bite coordinates server-side. Most robust but most complex.

The soft warning approach is the lowest-effort starting point and handles the common case without any per-sandwich setup.
