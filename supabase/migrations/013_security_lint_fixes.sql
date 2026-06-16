-- Resolve Supabase security linter warnings.
--
-- referral_tokens is only ever read/written via the service-role admin
-- client (src/lib/supabase/admin.ts), which bypasses RLS. Enabling RLS with
-- no policies blocks anon/authenticated access over the API without
-- affecting the app.
alter table referral_tokens enable row level security;

-- sandwiches_with_count and hot_sandwiches only read from sandwiches/bites,
-- which already have permissive "using (true)" select policies for
-- everyone. security_invoker makes the views check the querying user's RLS
-- instead of the view owner's, with no behavior change here.
alter view sandwiches_with_count set (security_invoker = true);
alter view hot_sandwiches set (security_invoker = true);
