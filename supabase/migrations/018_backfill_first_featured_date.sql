-- Backfill first_featured_date on existing approved (v1) sandwiches so
-- they're immediately eligible for the v2 repeat pool -- without this,
-- fillPipeline has no backlog candidates and can only ever place new
-- releases. Additive/safe to run now: no v1 code path reads this column.
update sandwiches
set first_featured_date = created_at::date
where approved = true
  and first_featured_date is null;
