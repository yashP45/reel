'use client';

import { formatDuration } from '@/lib/recordings';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface RecordingRow {
  id: string;
  title: string;
  storage_path: string;
  duration_ms: number;
  created_at: string;
  videoUrl: string;
  mimeType: string;
}

export function RecordingList({ recordings }: { recordings: RecordingRow[] }) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  const copyLink = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${siteUrl.replace(/\/$/, '')}/watch/${id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const deleteRecording = async (rec: RecordingRow, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${rec.title}"?`)) return;
    setDeletingId(rec.id);
    const supabase = createClient();
    await supabase.storage.from('recordings').remove([rec.storage_path]);
    await supabase.from('recordings').delete().eq('id', rec.id);
    setDeletingId(null);
    router.refresh();
  };

  if (recordings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-8 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-2xl">
          R
        </div>
        <p className="text-lg font-medium text-zinc-300">No recordings yet</p>
        <p className="mt-2 max-w-sm mx-auto text-sm text-zinc-500">
          Install the Reel extension, sign in, and record your first video. It will show up here with a preview.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {recordings.map((rec) => (
        <article
          key={rec.id}
          className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 transition hover:border-zinc-600 hover:bg-zinc-900/80"
        >
          <Link href={`/watch/${rec.id}`} className="block">
            <div className="relative aspect-video bg-black">
              <video
                src={rec.videoUrl}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
                <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-zinc-900 opacity-0 transition group-hover:opacity-100">
                  Watch
                </span>
              </div>
              <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-0.5 text-xs font-medium text-white">
                {formatDuration(rec.duration_ms)}
              </span>
            </div>
            <div className="px-4 pt-3 pb-2">
              <h2 className="truncate font-medium text-zinc-100 group-hover:text-white">
                {rec.title}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                {new Date(rec.created_at).toLocaleString()}
              </p>
            </div>
          </Link>
          <div className="flex flex-wrap gap-2 border-t border-zinc-800/80 px-4 py-3">
            <Link
              href={`/watch/${rec.id}`}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-800"
            >
              Open
            </Link>
            <button
              type="button"
              onClick={(e) => void copyLink(rec.id, e)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-800"
            >
              {copiedId === rec.id ? 'Copied!' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={(e) => void deleteRecording(rec, e)}
              disabled={deletingId === rec.id}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              {deletingId === rec.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
