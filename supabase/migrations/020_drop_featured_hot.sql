-- ============================================================================
-- DO NOT RUN THIS UNTIL V2 IS ACTUALLY LIVE IN PRODUCTION.
--
-- This is destructive to v1: the live admin review page's Feature/Unfeature
-- button and the "sandwich is heating up" email both still read `featured`
-- and `hot_sandwiches` as long as `main` (v1) is what's deployed. Running
-- this against the shared dev/prod DB before the v2 branch actually
-- replaces v1 in production will break production immediately.
--
-- Apply this only as part of the v2 cutover, right after (or atomically
-- with) deploying the v2 code to production.
-- ============================================================================

drop view if exists hot_sandwiches;
alter table sandwiches drop column if exists featured;
alter table sandwiches drop column if exists hot_notified_at;
