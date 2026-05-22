-- Reel: recordings table + storage bucket policies
-- Run in Supabase SQL editor or via CLI

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Recording',
  storage_path text not null,
  duration_ms integer not null default 0,
  session_id text not null,
  created_at timestamptz not null default now()
);

alter table public.recordings enable row level security;

-- Public read for share links (take-home; production would use signed URLs)
create policy "recordings_public_read"
  on public.recordings for select
  to anon, authenticated
  using (true);

-- Allow anonymous inserts from extension (scoped by session_id in app logic)
create policy "recordings_anon_insert"
  on public.recordings for insert
  to anon, authenticated
  with check (true);

-- Storage bucket: create "recordings" in Supabase Dashboard (public bucket for take-home)
-- Policies (run after bucket exists):

-- insert policy for anon
-- create policy "recordings_storage_insert" on storage.objects for insert
--   with check (bucket_id = 'recordings');

-- public read
-- create policy "recordings_storage_select" on storage.objects for select
--   using (bucket_id = 'recordings');
