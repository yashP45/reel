/** User picks tab/window/screen in Chrome's native share dialog */
export type RecordMode = 'picker';

export type RecorderPhase =
  | 'idle'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'processing'
  | 'preview'
  | 'uploading';

export interface RecordingOptions {
  mode: RecordMode;
  mic: boolean;
  webcam: boolean;
  tabId: number;
  tabTitle: string;
  countdownSec: number;
}

export interface RecordingMeta {
  id: string;
  title: string;
  durationMs: number;
  createdAt: number;
  mode: RecordMode;
  mimeType: string;
  fileExtension: 'webm';
  sizeBytes: number;
}

export interface StoredRecording extends RecordingMeta {
  shareUrl?: string;
  storagePath?: string;
  uploadStatus: 'pending' | 'uploading' | 'done' | 'error' | 'local';
  uploadError?: string;
}

export interface UploadProgress {
  recordingId: string;
  percent: number;
  status: 'uploading' | 'done' | 'error';
  shareUrl?: string;
  error?: string;
}
