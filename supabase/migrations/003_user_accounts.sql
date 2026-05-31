-- Profiles table: one row per auth user, display_name editable by the user
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- RLS: anyone can read profiles (for attribution display)
alter table profiles enable row level security;
create policy "profiles_select" on profiles for select using (true);
-- Users can only update their own profile
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Auto-create profile on sign-up using Google display name and avatar
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Partial unique index: one bite per sandwich per logged-in user
create unique index bites_sandwich_user_unique
  on bites(sandwich_id, user_id)
  where user_id is not null;

-- Index for fast profile lookups on bite history
create index bites_user_id_idx on bites(user_id);
