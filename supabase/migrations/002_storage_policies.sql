-- Create bucket "recordings" in Dashboard (public) before running this.

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
