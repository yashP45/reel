-- Auth + per-user ownership for Reel dashboard

alter table public.recordings
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists is_public boolean not null default true;

create index if not exists recordings_user_id_idx on public.recordings (user_id);

-- Drop permissive anon policies from take-home MVP
drop policy if exists "recordings_public_read" on public.recordings;
drop policy if exists "recordings_anon_insert" on public.recordings;
drop policy if exists "recordings_anon_update" on public.recordings;

-- Public watch links
create policy "recordings_public_read"
  on public.recordings for select
  to anon, authenticated
  using (is_public = true);

-- Authenticated owners: full CRUD on own rows
create policy "recordings_owner_select"
  on public.recordings for select
  to authenticated
  using (user_id = auth.uid());

create policy "recordings_owner_insert"
  on public.recordings for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "recordings_owner_update"
  on public.recordings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "recordings_owner_delete"
  on public.recordings for delete
  to authenticated
  using (user_id = auth.uid());

-- Anonymous extension uploads (session_id path) — keep for logged-out use
create policy "recordings_anon_insert"
  on public.recordings for insert
  to anon
  with check (user_id is null);

-- Storage: owners can manage files under their user_id prefix
drop policy if exists "recordings_storage_insert" on storage.objects;
drop policy if exists "recordings_storage_select" on storage.objects;
drop policy if exists "recordings_storage_update" on storage.objects;
drop policy if exists "recordings_storage_delete" on storage.objects;

create policy "recordings_storage_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'recordings');

create policy "recordings_storage_anon_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'recordings');

create policy "recordings_storage_authenticated_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings');

create policy "recordings_storage_authenticated_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
