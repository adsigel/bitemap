-- v2 daily-set scheduling. Additive only: new nullable columns and new
-- tables that no existing (v1) code path reads or writes. Safe to run
-- against the shared dev/prod database while v1 is still live --
-- nothing here changes v1 behavior. The matching teardown of `featured`
-- and `hot_sandwiches` (v1-only concepts replaced by this model) is a
-- separate, deliberately deferred migration applied at v2 cutover.

alter table sandwiches add column scheduled_for date;
alter table sandwiches add column first_featured_date date;

-- One row per (date, sandwich) currently slotted into that day's set of 5.
-- This table *is* the day's set -- "today's 5" = rows where date = today (ET).
create table daily_slots (
  date date not null,
  sandwich_id uuid not null references sandwiches(id) on delete cascade,
  is_new_release boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (date, sandwich_id)
);

create index daily_slots_date_idx on daily_slots(date);

-- Snapshot of final bite counts/ranks for a day's 5, written once at
-- midnight-ET rollover. Source of truth for recap emails and for
-- "yesterday / this week / last week" aggregate leaderboard views.
create table daily_leaderboard_results (
  date date not null,
  sandwich_id uuid not null references sandwiches(id) on delete cascade,
  bite_count int not null,
  rank int not null,
  primary key (date, sandwich_id)
);

create index daily_leaderboard_results_date_idx on daily_leaderboard_results(date);

alter table daily_slots enable row level security;
alter table daily_leaderboard_results enable row level security;

-- Anyone can read today's set and past results; writes go through the
-- service-role admin client (pipeline builder, rollover cron), same
-- pattern as sandwich approval/scheduling.
create policy "daily_slots_select" on daily_slots
  for select using (true);

create policy "daily_leaderboard_results_select" on daily_leaderboard_results
  for select using (true);
