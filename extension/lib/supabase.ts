import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAuthSession } from './auth-storage';
import { getSharePageUrl, isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { extensionFromMimeType } from './recording-format';
import { getSessionId } from './session';
import type { StoredRecording } from './types';

export { getSharePageUrl, isSupabaseConfigured };

let anonClient: SupabaseClient | null = null;

async function getClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;

  const auth = await getAuthSession();
  if (auth) {
    const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.setSession({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
    });
    return client;
  }

  if (!anonClient) {
    anonClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  }
  return anonClient;
}

async function uploadToStorage(
  supabase: SupabaseClient,
  storagePath: string,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  const { error } = await supabase.storage.from('recordings').upload(storagePath, blob, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

async function upsertRecordingRow(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('recordings').upsert(row, { onConflict: 'id' });
  if (error) {
    throw new Error(`Database save failed: ${error.message}`);
  }
}

export async function uploadRecording(
  recording: StoredRecording,
  blob: Blob,
  onProgress?: (percent: number) => void,
): Promise<{ shareUrl: string; storagePath: string }> {
  const supabase = await getClient();
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to extension/.env and rebuild.');
  }

  const auth = await getAuthSession();
  const sessionId = await getSessionId();
  const prefix = auth?.user_id ?? sessionId;
  const ext = recording.fileExtension ?? extensionFromMimeType(recording.mimeType);
  const storagePath = recording.storagePath ?? `${prefix}/${recording.id}.${ext}`;

  onProgress?.(10);

  try {
    await uploadToStorage(supabase, storagePath, blob, recording.mimeType);
  } catch (err) {
    throw err;
  }

  onProgress?.(60);

  const { data: publicUrlData } = supabase.storage.from('recordings').getPublicUrl(storagePath);

  const row: Record<string, unknown> = {
    id: recording.id,
    title: recording.title,
    storage_path: storagePath,
    duration_ms: recording.durationMs,
    session_id: sessionId,
    is_public: true,
  };
  if (auth?.user_id) row.user_id = auth.user_id;

  await upsertRecordingRow(supabase, row);

  onProgress?.(90);

  const shareBase = getSharePageUrl();
  const shareUrl = shareBase
    ? `${shareBase.replace(/\/$/, '')}/watch/${recording.id}`
    : publicUrlData.publicUrl;

  onProgress?.(100);
  return { shareUrl, storagePath };
}
