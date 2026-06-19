-- Fire-once guard for the "you've bitten N sandwiches, upload your own"
-- email, mirroring the hot_notified_at / live_notified_at pattern. Without
-- it, a user who passes the bite-count milestone would re-match the
-- condition on every later bite too.
alter table profiles add column upload_nudge_sent_at timestamptz;
