'use client';

import { useEffect, useState } from 'react';

interface VideoPlayerProps {
  src: string;
  mimeType: string;
}

export function VideoPlayer({ src, mimeType }: VideoPlayerProps) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      try {
        const res = await fetch(src, { method: 'HEAD' });
        if (!res.ok) throw new Error(`Video not found (${res.status})`);
        const len = Number(res.headers.get('content-length') || 0);
        if (len < 1024) {
          throw new Error('Video file is empty or corrupt. Record again with the latest extension.');
        }
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Video unavailable');
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>;
  }

  if (!ready) {
    return <p className="text-sm text-zinc-500">Loading video…</p>;
  }

  return (
    <video
      src={src}
      controls
      playsInline
      preload="auto"
      className="w-full rounded-xl border border-zinc-800 bg-black"
      onError={() => setError('Playback failed. Try Chrome or re-record in WebM format.')}
    >
      <source src={src} type={mimeType} />
    </video>
  );
}
