-- Tape Deck storage setup (additive to schema.sql — run after it in the Supabase SQL editor).
-- Creates two public buckets: "audio" for tape audio files and "artwork" for cover images.
-- Public read for everyone; uploads restricted to signed-in users;
-- file updates/deletes restricted to the file owner's folder (paths are "<user id>/<file>").

insert into storage.buckets (id, name, public)
values ('audio', 'audio', true), ('artwork', 'artwork', true)
on conflict (id) do nothing;

-- Anyone can read files in the public buckets.
drop policy if exists "tape deck public read" on storage.objects;
create policy "tape deck public read" on storage.objects
  for select
  using (bucket_id in ('audio', 'artwork'));

-- Signed-in users can upload into the buckets.
drop policy if exists "tape deck authenticated upload" on storage.objects;
create policy "tape deck authenticated upload" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('audio', 'artwork'));

-- Signed-in users can replace files inside their own folder.
drop policy if exists "tape deck owner update" on storage.objects;
create policy "tape deck owner update" on storage.objects
  for update to authenticated
  using (bucket_id in ('audio', 'artwork') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('audio', 'artwork') and (storage.foldername(name))[1] = auth.uid()::text);

-- Signed-in users can delete files inside their own folder.
drop policy if exists "tape deck owner delete" on storage.objects;
create policy "tape deck owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('audio', 'artwork') and (storage.foldername(name))[1] = auth.uid()::text);
