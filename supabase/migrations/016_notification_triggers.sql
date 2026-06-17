-- hot_sandwiches is a view recomputed live, so "becoming hot" has no
-- natural event to hook -- this flag lets us notify on the transition
-- exactly once and skip the check entirely afterward.
alter table sandwiches add column hot_notified_at timestamptz;

-- Cooldown for the "you've bitten everything" email: /all-done can be
-- revisited any time, so without this it would re-send on every visit.
alter table profiles add column last_all_done_email_at timestamptz;
