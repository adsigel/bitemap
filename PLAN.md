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
| Image moderation | Claude Haiku 4.5 (Anthropic) | Synchronous sandwich check on upload; ~$0.001–0.002/image |
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
| image_hash | text | SHA-256 of cropped JPEG; partial unique index prevents re-upload of identical images |
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
- [X] Upload crop step — pan/zoom crop before submitting
- [X] Duplicate detection — SHA-256 hash of cropped JPEG, partial unique index in Postgres
- [X] Image moderation — Claude Haiku vision check rejects non-sandwich photos on upload
- [ ] Bite breakdown by region (crust vs. middle, left vs. right)
- [ ] Leaderboard / most-bitten sandwiches

---

## Bitemark Score

The percentile score compares the user's local bite density to all other biters (implemented in `src/lib/percentile.ts`). Higher = more unique. Still used for share image captions and profile averages.

## Tribe / Cluster Copy

After a bite is submitted, `src/lib/cluster.ts` runs DBSCAN on all bites (including the user's) to group them into spatial clusters and assign the user to one.

**DBSCAN parameters:**
- `EPSILON` — **adaptive**: `max(0.05, 0.8 / sqrt(n))`. Shrinks as bite count grows so dense sandwiches don't collapse into one giant cluster. At n=100 → 0.08; n=200 → 0.057; n=400+ → 0.05.
- `MIN_PTS = 3` — minimum neighbours to be a core point
- `MIN_BITES = 15` — below this threshold, falls back to percentile-based copy

**Spatial descriptors** — cluster centroids are first remapped to sandwich-relative coordinates (5th/95th percentile bounding box of all bites) before labelling. This means "left side" reflects position on the sandwich, not the image frame — important when the sandwich doesn't fill the image. Thresholds on remapped coords: `< 0.35` = left/top, `> 0.65` = right/bottom, else center/middle.

| centroid position | label |
|---|---|
| center + middle | "the middle" |
| center + top/bottom | "the top" / "the bottom" |
| left/right + middle | "the left side" / "the right side" |
| left/right + top/bottom | "the top-left corner" / etc. |

**Heading vs body copy**: the heading always reflects where the **user bit** (remapped to sandwich-relative coords), not the cluster centroid. This avoids mislabeling border-point biters who land at the edge of a cluster whose center is elsewhere. Body copy uses cluster centroids to describe other groups for context.

**Copy variants:**
- User in biggest cluster → "Left-side biter / You're with the biggest camp — about 48%…"
- User in minority cluster → "Top-right biter / About 18% came here. The biggest group (55%) went for the left side."
- User is noise → "Off the beaten path / No major group formed here. Most biters (60%) clustered around the middle."
- Fewer than 15 bites or no clusters → falls back to percentile copy

### Future: Editorial cluster names

For sandwiches that cross a maturity threshold (e.g. 50+ bites) with ≥2 clusters, hand-craft cluster names in the admin UI instead of auto-generating them from centroids.

Implementation when ready:
1. Add `cluster_labels jsonb` column to `sandwiches` (e.g. `{"0": "the heel", "1": "the soft middle"}`)
2. Pass optional labels map into `getClusterCopy`; if a label exists for the user's cluster index, use it instead of `spatialDescriptor`
3. Admin UI: show cluster map + text inputs for each cluster after a sandwich matures

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

| Event | Where | Properties |
|---|---|---|
| Bite Taken | BiteCanvas (client) | sandwich_id, x, y, percentile, total_bites |
| Bite Moved | BiteCanvas (client) | sandwich_id |
| Sandwich Skipped | BiteCanvas (client) | sandwich_id |
| Sandwich Shared | BiteCanvas (client) | sandwich_id, method (native_share / download) |
| Sandwich Uploaded | upload/page (client) | title, status (success / rejected), failure_reason (duplicate / not_a_sandwich), sandwich_id (on success) |
| Account Created | Auth callback → client | fires once on first login |
| Profile Viewed | Profile page (client) | fires on mount |
| Username Edited | DisplayNameEditor (client) | fires after successful save |
| User Notified | sandwich-actions (server) | notification: "10th Bite" or "5th Sandwich Bite" |

Server-side events use the Amplitude HTTP API directly (no Node SDK) via `src/lib/track-server.ts`.

---

## Print Heatmaps

High-resolution print-quality images of bite density for a given sandwich. Visually distinct from the in-app heatmap — abstract and artistic, suitable for physical prints, tote bags, etc.

### Design

- **Silhouette**: sandwich image drawn to canvas with `filter: grayscale(100%)` at low opacity (12% dark / 8% light). No external API. Gives a ghost of the sandwich shape without competing with the data or raising copyright issues.
- **Density visualization**: filled topographic contour bands. KDE computed on a 200×200 grid using a Gaussian kernel. Grid smoothed with box-blur passes, then `d3-contour` generates polygon paths at N threshold levels. Bands drawn back-to-front (low density first).
- **Color palettes**:
  - Dark: near-black bg (`#0d0803`), bands from dark brown → burnt orange → pale amber
  - Light: off-white bg (`#faf7f4`), bands from cream → warm tan → deep rust
- **Canvas size**: 3000×3000px (10"×10" at 300dpi)
- **Caption**: centered bottom — *"where 1,234 people bit a BLT"* + `bitemap.food` attribution
- **Output**: PNG download via `canvas.toBlob('image/png')`

### Implementation

- [ ] Install `d3-contour` and `d3-array`
- [ ] `src/lib/print-heatmap.ts` — pure canvas renderer (no React): `generatePrintHeatmap({ bites, imageUrl, title, theme }): Promise<Blob>`
  - `drawSilhouette()` — grayscale ghost of sandwich image
  - `computeKDE()` — Gaussian kernel density on 200×200 grid
  - `smoothGrid()` — box-blur passes
  - `drawContours()` — d3-contour paths → filled bands
  - `drawCaption()` — title text + attribution
- [ ] `src/components/PrintHeatmapButton.tsx` — client component, same pattern as `TimelapseButton`. Fetches bites, calls renderer, triggers download. Light/dark toggle.
- [ ] Wire into admin review page (approved sandwiches) for now; consider adding to creator profile cards later.

### Stack additions

| Package | Purpose |
|---|---|
| `d3-contour` | Marching squares contour path generation |
| `d3-array` | Needed by d3-contour (likely already transitive) |

---

## Backlog

- **Gamification** — badges (e.g. "First Biter", "Outlier", "Century Club"), leaderboards by Bitemark score or bite count
- **More bite milestones** — 25, 50, 100 bites on a sandwich; notify uploader
- **Sandwich deletion** — let the submitter delete their own sandwich (with confirmation); admin can delete any
- **Email engagement** — periodic digest or re-engagement emails for dormant users

---

## Known Issues / Future Work

### Image moderation scaling

Current approach: synchronous Claude Haiku 4.5 vision check in `saveSandwich` before insert. ~$0.001–0.002/image. The check runs on the already-uploaded Supabase Storage URL and blocks the submission if it fails.

As volume grows, options in rough order of effort:

| Option | When to consider | Trade-offs |
|---|---|---|
| Keep Haiku synchronous | Up to ~50k uploads/month (~$50–100/mo) | Simple, zero infrastructure |
| Switch to async (background job) | When check latency becomes noticeable (~1–2s) | Faster UX; requires a queue/webhook + cleanup of rejected images |
| Google Vision / AWS Rekognition label detection | Cost-sensitive at high volume ($1–1.50/1k) | Cheaper per-image but less nuanced; may need label thresholding |
| Fine-tuned classifier | Very high volume + specific taxonomy needs | Best cost/accuracy but requires training data and infra |

The `failure_reason: "not_a_sandwich"` property on `Sandwich Uploaded` events is the signal to watch — if rejection rate climbs, it's worth auditing whether the prompt is too strict.

### Out-of-bounds bite detection
Users occasionally place bites outside the sandwich itself — on hands, plates, backgrounds, etc. Ideas for addressing this:

- **Soft warning**: If a bite lands far from the existing bite cluster centroid (e.g. >2 std deviations), show a gentle nudge: "That looks like it might be outside the sandwich — are you sure?" with a confirm/move option.
- **Upload-time bite zone**: Let sandwich submitters draw a rough bounding polygon on the image during upload. Bites outside the polygon trigger a warning.
- **ML segmentation**: Use a vision model to auto-detect the sandwich region and validate bite coordinates server-side. Most robust but most complex.

The soft warning approach is the lowest-effort starting point and handles the common case without any per-sandwich setup.
