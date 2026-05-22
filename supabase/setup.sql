-- Reel — one-shot Supabase setup
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Then create the storage bucket (if it doesn't exist):
--   Dashboard → Storage → New bucket → name: recordings → Public bucket: ON

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Recording',
  storage_path text not null,
  duration_ms integer not null default 0,
  session_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.recordings enable row level security;

drop policy if exists "recordings_public_read" on public.recordings;
drop policy if exists "recordings_anon_insert" on public.recordings;
drop policy if exists "recordings_anon_update" on public.recordings;

create policy "recordings_public_read"
  on public.recordings for select
  to anon, authenticated
  using (true);

create policy "recordings_anon_insert"
  on public.recordings for insert
  to anon, authenticated
  with check (true);

create policy "recordings_anon_update"
  on public.recordings for update
  to anon, authenticated
  using (true)
  with check (true);

-- ── Storage policies (bucket must exist: recordings) ────────────────────────

drop policy if exists "recordings_storage_insert" on storage.objects;
drop policy if exists "recordings_storage_select" on storage.objects;
drop policy if exists "recordings_storage_update" on storage.objects;
drop policy if exists "recordings_storage_delete" on storage.objects;

create policy "recordings_storage_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'recordings');

create policy "recordings_storage_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'recordings');

create policy "recordings_storage_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'recordings')
  with check (bucket_id = 'recordings');

create policy "recordings_storage_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'recordings');
