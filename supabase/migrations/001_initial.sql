-- Sandwiches table
create table sandwiches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Bites table
create table bites (
  id uuid primary key default gen_random_uuid(),
  sandwich_id uuid not null references sandwiches(id) on delete cascade,
  x float not null check (x >= 0 and x <= 1),
  y float not null check (y >= 0 and y <= 1),
  user_id uuid references auth.users(id),
  session_id text not null,
  created_at timestamptz default now(),
  -- One bite per sandwich per session
  unique (sandwich_id, session_id)
);

-- Index for fast bite lookups per sandwich
create index bites_sandwich_id_idx on bites(sandwich_id);

-- View with bite counts (used by listing page)
create view sandwiches_with_count as
  select
    s.*,
    count(b.id)::int as bite_count
  from sandwiches s
  left join bites b on b.sandwich_id = s.id
  group by s.id;

-- RLS
alter table sandwiches enable row level security;
alter table bites enable row level security;

-- Anyone can read sandwiches
create policy "sandwiches_select" on sandwiches
  for select using (true);

-- Anyone can read bites (for heatmap)
create policy "bites_select" on bites
  for select using (true);

-- Anyone can insert a bite (anon or authed)
create policy "bites_insert" on bites
  for insert with check (true);

-- Storage bucket for sandwich images
insert into storage.buckets (id, name, public)
  values ('sandwiches', 'sandwiches', true);

-- Anyone can read sandwich images
create policy "sandwich_images_select" on storage.objects
  for select using (bucket_id = 'sandwiches');

-- Only authenticated users (admins) can upload images for now
create policy "sandwich_images_insert" on storage.objects
  for insert with check (
    bucket_id = 'sandwiches' and auth.role() = 'authenticated'
  );
