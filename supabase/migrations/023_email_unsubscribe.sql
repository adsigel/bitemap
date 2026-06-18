-- Lets a user opt out of non-essential email (daily recaps, bite/timelapse
-- milestones) via a one-click unsubscribe link, without affecting
-- transactional email about their own submission's status (scheduled,
-- live, rejected). Additive/safe: new nullable column only.
alter table profiles add column marketing_unsubscribed_at timestamptz;
