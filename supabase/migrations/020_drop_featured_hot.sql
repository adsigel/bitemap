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

-- sandwiches_with_count does `select s.*`, so it depends on every column on
-- sandwiches as of its last CREATE -- including featured. Has to be
-- dropped and recreated around the column drops, same as 012/021 do in
-- reverse (recreating after *adding* a column).
drop view if exists sandwiches_with_count;

alter table sandwiches drop column if exists featured;
alter table sandwiches drop column if exists hot_notified_at;

create view sandwiches_with_count as
  select
    s.*,
    count(b.id)::int as bite_count
  from sandwiches s
  left join bites b on b.sandwich_id = s.id
  group by s.id;

grant select on sandwiches_with_count to anon, authenticated;
