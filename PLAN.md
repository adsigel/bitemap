# Bitemap — Development Plan

## Concept

Users tap on sandwich photos to indicate where they'd take the next bite. Bite coordinates are aggregated and visualized as heatmaps. Users can see whether their bite placement is typical or an outlier compared to the crowd.

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR for heatmap images, API routes, works great on mobile web |
| Database | Supabase (Postgres) | Managed Postgres + auth + image storage in one service |
| Auth | Supabase Auth | Optional — anonymous sessions by default, upgrade to account |
| Image storage | Supabase Storage | Simple, co-located with DB |
| ORM | Supabase JS client (direct) | Lightweight for this schema |
| Styling | Tailwind CSS | Fast, responsive-first |
| Bite UI | HTML Canvas / Konva.js | Tap-to-place interaction on top of sandwich image |
| Heatmap | heatmap.js or Canvas 2D | Rendered server-side or client-side over the image |
| Hosting | Vercel | Zero-config Next.js deployment |

---

## Data Model

### `sandwiches`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| title | text | e.g. "Italian Sub" |
| description | text | optional |
| image_url | text | Supabase Storage URL |
| uploaded_by | uuid | null = admin seed |
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

---

## Feature Scope

### MVP

- [ ] Admin sandwich seeding (manual image upload via Supabase dashboard or simple admin route)
- [ ] Sandwich listing page — grid of sandwiches
- [ ] Sandwich detail page — view image, tap to place a bite
- [ ] Bite submission — POST coordinate to DB, one bite per sandwich per session
- [ ] Heatmap overlay — show aggregated bite distribution on the image
- [ ] Outlier score — simple percentile: "Your bite was more central than 73% of people"

### Phase 2

- [ ] User accounts — sign up to track bite history across devices
- [ ] User-submitted sandwiches — upload photo + title, pending admin approval
- [ ] Sandwich moderation queue
- [ ] Bite breakdown by region (crust vs. middle, left vs. right)
- [ ] Leaderboard / most-bitten sandwiches

---

## Outlier Scoring (MVP approach)

1. Compute centroid of all bites for a sandwich
2. Calculate each bite's Euclidean distance from the centroid
3. User's bite percentile = rank within the distance distribution
4. Surface as: "You're a centrist biter" (< 33rd pct) / "You're in the middle" (33–66th) / "You're an outlier" (> 66th)

This is simple, explainable, and works at low bite counts. Can swap for kernel density estimation later.

---

## Page Structure

```
/                        → sandwich grid (most-bitten first)
/sandwich/[id]           → detail: image + tap UI + heatmap toggle + your score
/sandwich/[id]/heatmap   → standalone heatmap view (shareable)
/admin/upload            → seed a sandwich (protected route, no UI needed for MVP)
```

---

## Bite Interaction UX

1. User sees sandwich image with a subtle prompt ("Tap where you'd take your next bite")
2. Tap/click places a marker on the image (Canvas overlay)
3. Marker animates in; "Submit" or auto-submit after 1s
4. After submission, heatmap fades in showing all bites including theirs
5. Outlier score appears below

One bite per sandwich per browser session (cookie/localStorage). Logged-in users: one per account.

---

## Seeding Plan

Start with ~12 sandwiches covering a range of types:
- Classic deli (turkey club, BLT, Reuben)
- Hoagie / sub
- Grilled cheese
- Banh mi
- Torta
- Smash burger (stretch goal — is it a sandwich?)

Images sourced from user's camera roll or royalty-free sources. Upload via admin route or Supabase dashboard directly.

---

## Build Order

1. **Supabase setup** — project, tables, storage bucket, RLS policies
2. **Next.js scaffold** — repo init, Tailwind, Supabase client
3. **Admin seed route** — `/admin/upload` with simple form
4. **Sandwich grid** — listing page pulling from DB
5. **Bite UI** — canvas overlay, tap interaction, submit to DB
6. **Heatmap** — aggregate bites, render heatmap over image
7. **Outlier score** — compute and display percentile
8. **Auth (optional)** — Supabase Auth, session → account upgrade
9. **Polish** — loading states, empty states, mobile feel

---

## Known Issues / Future Work

### Out-of-bounds bite detection
Users occasionally place bites outside the sandwich itself — on hands, plates, backgrounds, etc. (observed in the wild). Ideas for addressing this:

- **Soft warning**: If a bite lands far from the existing bite cluster centroid (e.g. >2 std deviations), show a gentle nudge: "That looks like it might be outside the sandwich — are you sure?" with a confirm/move option.
- **Upload-time bite zone**: Let sandwich submitters draw a rough bounding polygon on the image during upload. Bites outside the polygon trigger a warning.
- **ML segmentation**: Use a vision model to auto-detect the sandwich region and validate bite coordinates server-side. Most robust but most complex.

The soft warning approach is the lowest-effort starting point and handles the common case without any per-sandwich setup.

---

## Open Questions

- Should the heatmap be visible before the user submits their bite, or only after? (Seeing it first anchors behavior — probably hide it until after submission)
- Is one bite per sandwich per session strict (no re-biting) or can users update their placement?
- Do we want a "skip" option for sandwiches users haven't eaten / don't like?
