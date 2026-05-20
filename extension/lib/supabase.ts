import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSessionId } from './session';
import type { StoredRecording } from './types';

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSharePageUrl(): string {
  return import.meta.env.VITE_SHARE_PAGE_URL ?? '';
}

export async function uploadRecording(
  recording: StoredRecording,
  blob: Blob,
  onProgress?: (percent: number) => void,
): Promise<{ shareUrl: string; storagePath: string }> {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env');

  const sessionId = await getSessionId();
  const storagePath = `${sessionId}/${recording.id}.webm`;

  onProgress?.(10);

  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(storagePath, blob, {
      contentType: recording.mimeType,
      upsert: true,
    });

  if (uploadError) throw new Error(uploadError.message);

  onProgress?.(60);

  const { data: publicUrlData } = supabase.storage.from('recordings').getPublicUrl(storagePath);

  const { error: dbError } = await supabase.from('recordings').insert({
    id: recording.id,
    title: recording.title,
    storage_path: storagePath,
    duration_ms: recording.durationMs,
    session_id: sessionId,
  });

  if (dbError) throw new Error(dbError.message);

  onProgress?.(90);

  const shareBase = getSharePageUrl();
  const shareUrl = shareBase
    ? `${shareBase.replace(/\/$/, '')}/watch/${recording.id}`
    : publicUrlData.publicUrl;

  onProgress?.(100);
  return { shareUrl, storagePath };
}
