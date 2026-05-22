export function mimeFromStoragePath(path: string): string {
  return path.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
}

export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
