import { finalizeRecordingBlob } from './fix-webm-blob';
import { MIN_RECORDING_BYTES, pickRecordingFormat } from './recording-format';
import type { RecordingMeta } from './types';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let displayStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let startedAt = 0;

function stopTracks(): void {
  displayStream?.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop());
  displayStream = null;
  micStream = null;
}

export function isPanelRecording(): boolean {
  return mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused';
}

export async function startPanelRecording(
  enableMic: boolean,
  handlers: {
    onStarted: () => void;
    onComplete: (meta: RecordingMeta, buffer: ArrayBuffer) => void;
    onError: (error: string) => void;
  },
): Promise<void> {
  cancelPanelRecording();
  recordedChunks = [];
  startedAt = Date.now();

  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: true,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError') {
      handlers.onError('Share cancelled — choose a tab, window, or screen to record.');
      return;
    }
    handlers.onError(err instanceof Error ? err.message : 'Could not start screen capture');
    return;
  }

  if (enableMic && displayStream.getAudioTracks().length === 0) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      const track = micStream.getAudioTracks()[0];
      if (track) displayStream.addTrack(track);
    } catch {
      // Tab/window may not include system audio — mic-only is optional
    }
  }

  if (displayStream.getVideoTracks().length === 0) {
    stopTracks();
    handlers.onError('No video track — try Window or Entire screen in the dialog.');
    return;
  }

  const { mimeType, extension } = pickRecordingFormat();

  try {
    mediaRecorder = new MediaRecorder(displayStream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    });
  } catch {
    mediaRecorder = new MediaRecorder(displayStream, { mimeType: 'video/webm' });
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onerror = () => {
    handlers.onError('Recording failed. Try again.');
    cancelPanelRecording();
  };

  mediaRecorder.onstop = async () => {
    await new Promise((r) => setTimeout(r, 150));
    const type = mediaRecorder?.mimeType || 'video/webm';
    const blob = new Blob(recordedChunks, { type });
    const durationMs = Date.now() - startedAt;
    const { extension: ext } = pickRecordingFormat();

    stopTracks();
    mediaRecorder = null;

    if (blob.size < MIN_RECORDING_BYTES) {
      handlers.onError(
        `No video captured (${blob.size} bytes after ${Math.round(durationMs / 1000)}s). Pick Entire screen or Window and keep it open.`,
      );
      return;
    }

    const finalized = await finalizeRecordingBlob(blob, durationMs, type);
    const buffer = await finalized.arrayBuffer();

    handlers.onComplete(
      {
        id: crypto.randomUUID(),
        title: 'Recording',
        durationMs,
        createdAt: Date.now(),
        mode: 'picker',
        mimeType: type,
        fileExtension: ext,
        sizeBytes: finalized.size,
      },
      buffer,
    );
  };

  mediaRecorder.start(500);
  handlers.onStarted();
}

export function stopPanelRecording(): void {
  if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') {
    try {
      if (mediaRecorder.state === 'recording') mediaRecorder.requestData();
    } catch {
      // ignore
    }
    mediaRecorder.stop();
  }
}

export function pausePanelRecording(): void {
  if (mediaRecorder?.state === 'recording') mediaRecorder.pause();
}

export function resumePanelRecording(): void {
  if (mediaRecorder?.state === 'paused') mediaRecorder.resume();
}

export function cancelPanelRecording(): void {
  if (mediaRecorder) {
    mediaRecorder.onstop = null;
    if (mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorder = null;
  }
  recordedChunks = [];
  stopTracks();
}
