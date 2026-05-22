export type RecordingExtension = 'webm';

export interface RecordingFormat {
  mimeType: string;
  extension: RecordingExtension;
}

/** Chrome reports MP4 as supported but often produces corrupt tiny files — WebM only. */
const CANDIDATES: RecordingFormat[] = [
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=h264,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

export const MIN_RECORDING_BYTES = 50 * 1024;

export function pickRecordingFormat(): RecordingFormat {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', extension: 'webm' };
  }

  for (const candidate of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
  }

  throw new Error('This browser cannot record video (no supported WebM format).');
}

export function extensionFromMimeType(mimeType: string): RecordingExtension {
  return 'webm';
}

export function mimeTypeFromPath(path: string): string {
  if (path.endsWith('.mp4')) return 'video/mp4';
  return 'video/webm';
}
