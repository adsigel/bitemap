-- Resolve remaining (WARN-level) Supabase security linter items.
--
-- handle_new_user already fully-qualifies public.profiles, so pinning
-- search_path is pure hardening with no behavior change. It also
-- `returns trigger`, so it can't actually be invoked via RPC outside
-- trigger context -- revoking PUBLIC execute just removes the unnecessary
-- grant; trigger firing isn't privilege-checked against the calling role.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

revoke execute on function handle_new_user() from public;

-- sandwich_images_select only gates the storage "list"/"info" API; public
-- bucket downloads via getPublicUrl() don't check storage.objects RLS at
-- all. The app never lists the bucket, so dropping this policy removes
-- the ability to enumerate uploaded filenames without affecting image
-- loading or uploads (which both go through the service-role client).
drop policy "sandwich_images_select" on storage.objects;

-- bites_insert's WITH CHECK (true) is intentional, not fixed here: it's
-- what allows anonymous visitors to record bites, which is core to the
-- app. The (sandwich_id, session_id) unique constraint is the abuse guard.
