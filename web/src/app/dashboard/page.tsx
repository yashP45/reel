import { RecordingList } from '@/components/RecordingList';
import { mimeFromStoragePath } from '@/lib/recordings';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: recordings, error } = await supabase
    .from('recordings')
    .select('id, title, storage_path, duration_ms, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-red-400">Could not load recordings: {error.message}</p>
        <p className="mt-2 text-sm text-zinc-500">
          Run supabase/migrations/004_auth_users.sql in your Supabase SQL editor.
        </p>
      </div>
    );
  }

  const rows =
    recordings?.map((rec) => {
      const { data: urlData } = supabase.storage
        .from('recordings')
        .getPublicUrl(rec.storage_path);
      return {
        ...rec,
        videoUrl: urlData.publicUrl,
        mimeType: mimeFromStoragePath(rec.storage_path),
      };
    }) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500 font-bold">
            R
          </div>
          <div>
            <h1 className="text-xl font-semibold">Your recordings</h1>
            <p className="text-sm text-zinc-500">{user.email}</p>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-300">
            Sign out
          </button>
        </form>
      </header>

      <RecordingList recordings={rows} />
    </div>
  );
}
