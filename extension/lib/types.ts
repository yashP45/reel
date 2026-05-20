export type RecordMode = 'tab' | 'window' | 'screen';

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
  sizeBytes: number;
}

export interface StoredRecording extends RecordingMeta {
  /** base64-encoded webm for local preview/library */
  dataBase64?: string;
  shareUrl?: string;
  storagePath?: string;
  uploadStatus: 'pending' | 'uploading' | 'done' | 'error';
  uploadError?: string;
}

export interface UploadProgress {
  recordingId: string;
  percent: number;
  status: 'uploading' | 'done' | 'error';
  shareUrl?: string;
  error?: string;
}
