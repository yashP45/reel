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

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  titleEl.textContent = 'Video unavailable';
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
  player.src = urlData.publicUrl;
}

load();
