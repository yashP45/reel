import { VideoPlayer } from '@/components/VideoPlayer';
import { formatDuration, mimeFromStoragePath } from '@/lib/recordings';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recordings')
    .select('id, title, storage_path, duration_ms, created_at')
    .eq('id', id)
    .single();

  if (error || !data) notFound();

  const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(data.storage_path);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500 font-bold">
          R
        </div>
        <div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <p className="text-sm text-zinc-500">
            {formatDuration(data.duration_ms)} · {new Date(data.created_at).toLocaleDateString()}
          </p>
        </div>
      </header>
      <VideoPlayer src={urlData.publicUrl} mimeType={mimeFromStoragePath(data.storage_path)} />
    </div>
  );
}
