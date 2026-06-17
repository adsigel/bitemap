-- Fire-once guard for the "your sandwich is live today" email, mirroring
-- the hot_notified_at pattern -- protects against a double-send if the
-- rollover cron is retried. Additive/safe: no v1 code path reads this.
alter table sandwiches add column live_notified_at timestamptz;
