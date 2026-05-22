-- Fix RLS for Reel extension (anon uploads + public reads)
-- Safe to re-run in Supabase SQL Editor

-- ── Table: public.recordings ────────────────────────────────────────────────

alter table public.recordings enable row level security;

drop policy if exists "recordings_public_read" on public.recordings;
drop policy if exists "recordings_anon_insert" on public.recordings;
drop policy if exists "recordings_anon_update" on public.recordings;

create policy "recordings_public_read"
  on public.recordings
  for select
  to anon, authenticated
  using (true);

create policy "recordings_anon_insert"
  on public.recordings
  for insert
  to anon, authenticated
  with check (true);

-- needed if you ever upsert metadata rows
create policy "recordings_anon_update"
  on public.recordings
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- ── Storage bucket: recordings ──────────────────────────────────────────────
-- Create the bucket first in Dashboard → Storage → New bucket → name: recordings → Public

drop policy if exists "recordings_storage_insert" on storage.objects;
drop policy if exists "recordings_storage_select" on storage.objects;
drop policy if exists "recordings_storage_update" on storage.objects;
drop policy if exists "recordings_storage_delete" on storage.objects;

create policy "recordings_storage_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'recordings');

create policy "recordings_storage_select"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'recordings');

create policy "recordings_storage_update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'recordings')
  with check (bucket_id = 'recordings');

-- optional: allow overwrite on upsert retries
create policy "recordings_storage_delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'recordings');
