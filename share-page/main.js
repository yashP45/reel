import { createClient } from '@supabase/supabase-js';

const params = new URLSearchParams(window.location.search);
const pathMatch = window.location.pathname.match(/\/watch\/([^/]+)/);
const recordingId = pathMatch?.[1] ?? params.get('id');

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

const titleEl = document.getElementById('title');
const metaEl = document.getElementById('meta');
const player = document.getElementById('player');
const errorEl = document.getElementById('error');
const loadingEl = document.getElementById('loading');

function showError(msg) {
  if (loadingEl) loadingEl.classList.add('hidden');
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  titleEl.textContent = 'Video unavailable';
  player.classList.add('hidden');
}

function mimeFromPath(path) {
  if (path?.endsWith('.mp4')) return 'video/mp4';
  return 'video/webm';
}

async function verifyVideoUrl(videoUrl) {
  const res = await fetch(videoUrl, { method: 'HEAD' });
  if (!res.ok) {
    throw new Error(`Video not found (${res.status}). Check that the storage bucket is public.`);
  }
  const len = Number(res.headers.get('content-length') || 0);
  if (len < 1024) {
    throw new Error(
      'Video file is empty or corrupt. Record again with the latest extension (WebM format).',
    );
  }
  return res;
}

function setupPlayer(videoUrl, mimeType) {
  player.classList.remove('hidden');
  player.removeAttribute('src');
  player.innerHTML = '';
  player.src = videoUrl;
  player.type = mimeType;
  player.preload = 'auto';
  player.playsInline = true;
  player.controls = true;

  player.addEventListener(
    'loadedmetadata',
    () => {
      if (loadingEl) loadingEl.classList.add('hidden');
    },
    { once: true },
  );

  player.addEventListener(
    'error',
    () => {
      const code = player.error?.code;
      if (code === 4) {
        showError('This browser cannot play this format. Try Chrome, or download from the extension.');
      } else {
        showError('Video failed to load. The file may be corrupt — record again.');
      }
    },
    { once: true },
  );

  player.load();
}

async function load() {
  if (!recordingId) {
    showError('Missing recording ID in URL.');
    return;
  }

  if (!url || !key) {
    showError('Share page is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    return;
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('recordings')
    .select('id, title, storage_path, duration_ms, created_at')
    .eq('id', recordingId)
    .single();

  if (error || !data) {
    showError('Recording not found.');
    return;
  }

  titleEl.textContent = data.title;
  const mins = Math.floor((data.duration_ms ?? 0) / 60000);
  const secs = Math.floor(((data.duration_ms ?? 0) % 60000) / 1000);
  metaEl.textContent = `${mins}:${secs.toString().padStart(2, '0')} · ${new Date(data.created_at).toLocaleDateString()}`;

  const { data: urlData } = supabase.storage.from('recordings').getPublicUrl(data.storage_path);
  const mimeType = mimeFromPath(data.storage_path);

  try {
    await verifyVideoUrl(urlData.publicUrl);
    setupPlayer(urlData.publicUrl, mimeType);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Video unavailable');
  }
}

load();
