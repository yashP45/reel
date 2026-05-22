import fixWebmDuration from 'fix-webm-duration';

/** MediaRecorder WebM files often lack duration metadata — breaks seeking and share-page playback. */
export async function finalizeRecordingBlob(blob: Blob, durationMs: number, mimeType: string): Promise<Blob> {
  if (!mimeType.includes('webm')) return blob;
  return fixWebmDuration(blob, durationMs, { logger: false });
}
