# Bitemap v2 — Daily Set Redesign

Builds on [PLAN.md](PLAN.md) (v1 architecture, stack, Bitemark score, clustering copy — all unchanged unless noted here).

## Concept

v1 is free-browse: every approved sandwich is always available, sequenced by an algorithm. v2 turns scarcity into a feature: **each calendar day, exactly 5 sandwiches are "live."** Users still land on a single-sandwich page and bite one at a time, but once they've bitten all 5 of today's set, they hit a **Daily Leaderboard** instead of `/all-done` — a payoff screen with offramps to keep exploring the backlog or upload their own.

Uploads no longer go live immediately on admin approval. They join a queue and are scheduled onto a future day, with the uploader told *when* it'll go live, then told again *when it does*.

---

## Decisions locked in for this round

- **Repeat-slot picking**: hybrid. An algorithm proposes the leftover (non-new-release) slots for each upcoming day; admin can override any slot before it goes live.
- **Per-uploader cap**: max 1 slot per uploader per day, enforced by the system (not just admin discretion) — guards against one prolific uploader (e.g. Adam, historically ~70% of all sandwiches) dominating a day. See [[project_bitemap]] / hot-email memory for the prior incident this guards against.
  - **Known consequence**: a day can never have more sandwiches than there are distinct uploaders with available backlog/queue sandwiches that day. With only 4 distinct uploader identities in the system as of June 2026 (one account holding ~94% of the remaining backlog), days routinely land at 4/5 rather than 5/5. Decided to accept this and let it self-resolve as uploader diversity grows, rather than relax the cap or special-case the 5th slot.
- **Rollover timezone**: US Eastern. "Midnight" everywhere below means midnight ET.
- **Leaderboard history**: no per-day archive page. Instead, daily results are snapshotted and rolled up into browsable aggregate views: *yesterday's top bites*, *this week's top bites*, *last week's top bites*.
- **Missed days**: a user always sees *today's* 5, whatever that is. Days they didn't visit simply roll into the general backlog — no catch-up queue.
- **Anonymous users**: same daily set, same 5-bite gate, same Daily Leaderboard payoff as logged-in users — consistent with v1's anon-first session tracking.
- **Order within a day**: randomized per session/user, same as v1's pool-based pick-next logic — not a fixed 1–5 sequence for everyone.
- **Recap email audience**: featured uploaders *and* any authed user who bit at least one of today's 5. If someone is both, they get the uploader version only (how *their* sandwich did), not the more objective day-overview version.
- **`featured` and `hot` are retired for v2.** Neither concept maps cleanly onto a curated daily model — `featured` was a manual visibility boost in a free-browse world, and `hot` ("trending") doesn't mean much when only 5 sandwiches are live on a given day and already have a leaderboard. Drop the `featured` column, the `hot_sandwiches` view, and the "sandwich is heating up" email in the v2 migration. Worth reintroducing some equivalent curation/momentum signal later once we've seen how the daily model actually behaves — but starting clean rather than carrying over assumptions from the old model.
- **Backlog bites count fully**: a bite placed via `/explore` on a sandwich that happens to also be in today's set still counts toward Bitemark score, milestone emails, and cumulative bite counts — same as any other bite. No special-casing by route.
- **Draft pipeline depth**: 4 days (today + 3 future days), to start. Expect to tune this once there's real usage data on the admin override UX.
- **No queue-depth UI**: the upload flow doesn't show "next open day" or similar queue-position hints. The scheduled-for email is the only timing signal a user gets.

---

## Data Model Changes

### `sandwiches` (new/changed columns)

| Column | Type | Notes |
|---|---|---|
| `approved` | bool | unchanged — still "passed moderation," not "is live" |
| `scheduled_for` | date, nullable | the ET date this sandwich is currently slotted for (today or a future day in the draft pipeline). Null = approved but not yet slotted (shouldn't persist long — see pipeline below), or never approved. |
| `first_featured_date` | date, nullable | set the first time a sandwich is ever assigned to a daily set. Null = brand new, never been live. Used to distinguish "new release" vs "repeat" when filling a day, and to define the backlog (`first_featured_date < today`). |

`approved = true` no longer means visible to biters — it means "eligible to be scheduled." Visibility is entirely driven by `scheduled_for` / `first_featured_date`.

**Retired**: `featured` column and the `hot_sandwiches` view are dropped in the v2 migration (see decisions above) — neither is read by the new daily-set algorithm.

### `daily_slots` (new table)

| Column | Type | Notes |
|---|---|---|
| `date` | date | ET calendar date, PK part 1 |
| `sandwich_id` | uuid | FK → sandwiches, PK part 2 |
| `is_new_release` | bool | true if this is the sandwich's `first_featured_date` |
| `created_at` | timestamptz | when this slot was assigned (for queue-order debugging) |

Unique on `(date)` capped at 5 rows; unique on `(date, sandwich_id)`. No `slot_index` — order is randomized client-side per session, not stored.

This table *is* the day's set. "Today's 5" = `daily_slots where date = today_et()`. The draft pipeline (below) pre-populates rows for a few days ahead; admin edits just delete/insert rows for a future date.

### `daily_leaderboard_results` (new table — snapshot)

| Column | Type | Notes |
|---|---|---|
| `date` | date | PK part 1 |
| `sandwich_id` | uuid | PK part 2 |
| `bite_count` | int | final count of bites with `created_at` inside that ET day, captured at rollover |
| `rank` | int | 1–5, computed at snapshot time |

Written once, at the midnight-ET rollover, for the day that's ending. This is the source of truth for the Daily Leaderboard payoff screen (which can show live counts intra-day by querying `bites` directly, then freezes to this snapshot once the day closes), the recap email, and the "yesterday / this week / last week" aggregate views (`sum(bite_count) group by sandwich_id` over a date range).

### `bites` / `profiles`

Unchanged.

---

## Daily Set Lifecycle

### The draft pipeline

Rather than building only "tomorrow," the system maintains a rolling **4-day draft pipeline**: today (live) + 3 days of pre-built drafts. This is what lets an uploader be told a concrete "scheduled for [date]" the moment their sandwich is approved, rather than a vague "you're in the queue."

**On admin approval** of a sandwich:
1. Walk the pipeline forward from the earliest open day.
2. Assign it to the first day that (a) has an open slot and (b) doesn't already have a sandwich from this uploader (the per-uploader cap). If no day in the pipeline qualifies, extend the pipeline by a day and assign it there.
3. Write the `daily_slots` row (`is_new_release = true`), set `sandwiches.scheduled_for`.
4. Send the uploader the "scheduled for [date]" email.

**Filling leftover slots** (repeat pool): whenever a draft day has fewer than 5 rows after new-release assignment, the algorithm fills the rest from the backlog (`first_featured_date is not null and first_featured_date < pipeline_day`), respecting the same per-uploader cap and excluding sandwiches already slotted elsewhere in the pipeline. Selection weighting (reuse the spirit of v1's `pick-next-sandwich.ts`): prioritize longest-time-since-last-featured. (No `featured` pin boost — that flag is retired in v2; see decisions above.) This runs continuously as drafts shift (e.g. after an admin edit) — always keep future pipeline days topped up to 5.

**Admin override**: the admin review page gets a "Upcoming Days" panel showing the 3 draft days, each slot tagged new-release vs repeat. Admin can swap any repeat slot for a different backlog sandwich, or reorder which day a not-yet-locked new release lands on (subject to the same cap). Today's day, once live, is not editable.

### Midnight ET rollover (cron)

1. Snapshot the ending day: for each of its 5 `daily_slots`, count today's bites, write `daily_leaderboard_results` rows with rank.
2. Send recap emails: each featured uploader gets the uploader version ("how your sandwich placed"); any other authed user who bit ≥1 of today's 5 gets the day-overview leaderboard version. A user who is both only gets the uploader version.
3. The new day is already live by virtue of `daily_slots` containing rows for it — nothing to "promote."
4. Send "it's live!" emails to uploaders of the new day's new-release slots.
5. Extend the pipeline: ensure 3 days beyond the new "today" are drafted and topped up to 5 (run the same fill logic as above).

---

## Per-User Daily Flow

1. Landing page resolves `today_et()`, fetches `daily_slots` for that date (5 sandwich rows), and the user's bites so far against those 5 (by user_id or session_id, same dedup as v1).
2. If fewer than 5 bitten: pick one of the unbitten ones at random (reuse v1's random-pool-pick pattern, scoped to just these 5) → `/sandwich/[id]`.
3. If all 5 bitten: route to the Daily Leaderboard payoff (replaces `/all-done`):
   - Live (or snapshotted, if day has rolled over mid-render) ranking of today's 5 by bite count.
   - Offramp: "Explore older sandwiches" → v1's free-browse experience, scoped to the backlog (`first_featured_date < today`), excluding today's 5 (already done).
   - Offramp: "Upload your own for a future day" → `/upload`, with copy reframed to set queue expectations (see below).

---

## Upload Flow Changes

`/upload` copy must stop implying instant visibility. New framing: *"Sandwiches go through a quick review, then get scheduled for a future day — we'll email you the date."*

Post-submit states:
- Pending review (unchanged from v1: moderation + duplicate check, admin notified).
- On approval → pipeline assigns a `scheduled_for` date immediately (per above) → uploader gets the "scheduled" email with the date.
- On that date's rollover → uploader gets the "it's live" email.
- Rejection flow unchanged.

---

## Page Structure Changes

```
/                      → today's pick (single sandwich) or Daily Leaderboard if done
/sandwich/[id]         → unchanged: bite UI + heatmap + Bitemark score
/leaderboard           → new: yesterday's top bites, this week, last week (aggregate, always browsable)
/explore               → new: v1's free-browse experience, scoped to backlog, reachable from the Daily Leaderboard offramp and nav
/upload                → copy updated for queue framing
/admin/review          → existing moderation queue + new "Upcoming Days" draft panel
/profile               → add: "your sandwich is scheduled for [date]" / "live today" status on submitted sandwiches
```

`/all-done` is retired in favor of the Daily Leaderboard screen (likely the same route as `/`, conditionally rendered, rather than a separate URL — TBD during implementation).

---

## Email Notifications (changes from v1 table)

| Trigger | Recipient | Subject |
|---|---|---|
| New sandwich submitted | Admin | unchanged |
| Sandwich approved + scheduled | Uploader | "Your sandwich is scheduled for {date} 🥪" *(replaces v1's immediate "is live")* |
| Sandwich goes live | Uploader | "{title} is live today — go get your first bites" |
| Daily recap — your sandwich placed | Uploader (if featured that day) | "{title} ranked #{n} today" |
| Daily recap — leaderboard | Any other authed user who bit ≥1 of today's set | "Today's leaderboard 🏆" |
| Sandwich rejected | Uploader | unchanged |
| Bite count milestones (10th bite, 100-bite timelapse) | Uploader | unchanged, still apply to backlog sandwiches |
| ~~Sandwich is "heating up" (hot/trending)~~ | ~~Uploader~~ | **retired in v2** — see `featured`/`hot` decision above |
| ~~Sandwich got featured~~ | ~~Uploader~~ | **retired in v2** |

A user who is both an uploader-in-today's-set and a biter of today's set gets only the uploader version (resolved — no merge logic needed).

---

## Open Questions / Backlog for Next Pass

- Pipeline depth (starting at 4 days) is a tuning knob — deeper pipeline means more advance notice for uploaders but more admin surface to manage and more days "locked in" before reacting to e.g. a great submission that should jump the queue. Revisit once there's real submission volume data.
- `unpublishSandwich` (admin "Unpublish" button) sets `approved = false` but doesn't remove any `daily_slots` row the sandwich already occupies — an admin unpublishing a sandwich that's scheduled for an upcoming day won't actually pull it out of that day's set. Needs a fix before this matters in practice (i.e. before there's enough queue depth for "unpublish something already scheduled" to be a real scenario).
- If/when we reintroduce a `featured`- or `hot`-style curation signal post-v2, decide whether it boosts repeat-pool selection odds, guarantees a slot, or is purely cosmetic (badge with no scheduling effect).
