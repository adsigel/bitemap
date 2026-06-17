-- Storage bucket for user-uploaded profile photos. Additive/safe: a new
-- bucket plus policies, doesn't touch anything v1 reads or writes.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true);

-- Anyone can read avatars
create policy "avatar_images_select" on storage.objects
  for select using (bucket_id = 'avatars');

-- A user can only write to their own folder, e.g. avatars/{user_id}/avatar.jpg
create policy "avatar_images_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatar_images_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
