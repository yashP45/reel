import { saveRecordingBlob } from '../../lib/blob-store';
import { finalizeRecordingBlob } from '../../lib/fix-webm-blob';
import type { Message } from '../../lib/messaging';
import type { RecordingOptions } from '../../lib/types';
import { MIN_RECORDING_BYTES, pickRecordingFormat } from '../../lib/recording-format';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let displayStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let chunkTimer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let currentOptions: RecordingOptions | null = null;
let stopReason: 'user' | 'track-ended' | 'error' | null = null;

function clearChunkTimer(): void {
  if (chunkTimer) clearInterval(chunkTimer);
  chunkTimer = null;
}

function stopAllStreams(): void {
  clearChunkTimer();
  displayStream?.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop());
  displayStream = null;
  micStream = null;
}

function watchCaptureTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.onended = () => {
      if (stopReason === null && mediaRecorder?.state === 'recording') {
        stopReason = 'track-ended';
        stopRecording();
      }
    };
  }
}

function trackEndedError(durationMs: number): string {
  if (durationMs < 2000) {
    return 'Capture ended right away — pick a source in the Chrome dialog and keep it open.';
  }
  return 'Capture stopped unexpectedly. Keep the shared window or screen open and try again.';
}

async function getDisplayPickerStream(): Promise<{
  stream: MediaStream;
  displaySurface: string | undefined;
}> {
  const options: DisplayMediaStreamOptions = {
    video: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: true,
  };

  if (typeof CaptureController !== 'undefined') {
    const controller = new CaptureController();
    // Switch to the tab/window the user picked (no-op for entire screen).
    controller.setFocusBehavior('focus-captured-surface');
    options.controller = controller;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia(options);
  const displaySurface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
  return { stream, displaySurface };
}

async function getDesktopStream(streamId: string): Promise<MediaStream> {
  const mandatory = {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: streamId,
  };

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { mandatory } as MediaTrackConstraints,
    audio: { mandatory } as MediaTrackConstraints,
  });

  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState === 'ended') {
    throw new Error('Desktop capture ended immediately. Try Record again.');
  }

  return stream;
}

async function maybeAddMic(stream: MediaStream, enableMic: boolean): Promise<MediaStream> {
  if (!enableMic) return stream;
  if (stream.getAudioTracks().length > 0) return stream;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    const audioTracks = micStream.getAudioTracks();
    if (audioTracks.length > 0) stream.addTrack(audioTracks[0]!);
  } catch {
    chrome.runtime.sendMessage({ type: 'MIC_UNAVAILABLE' } satisfies Message).catch(() => {});
  }
  return stream;
}

function createRecorder(stream: MediaStream): MediaRecorder {
  const { mimeType } = pickRecordingFormat();
  const options: MediaRecorderOptions = { mimeType, videoBitsPerSecond: 2_500_000 };

  if (MediaRecorder.isTypeSupported(mimeType)) {
    return new MediaRecorder(stream, options);
  }
  return new MediaRecorder(stream, { mimeType: 'video/webm' });
}

async function startRecording(options: RecordingOptions, streamId?: string): Promise<string | undefined> {
  stopAllStreams();
  recordedChunks = [];
  currentOptions = options;
  startedAt = Date.now();
  stopReason = null;

  let sourceStream: MediaStream;
  let displaySurface: string | undefined;
  if (streamId) {
    sourceStream = await getDesktopStream(streamId);
  } else {
    try {
      const picked = await getDisplayPickerStream();
      sourceStream = picked.stream;
      displaySurface = picked.displaySurface;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError') {
        throw new Error('Share cancelled — pick a tab, window, or screen to record.');
      }
      throw err;
    }
  }

  watchCaptureTracks(sourceStream);

  // Record the display stream directly — canvas re-encoding often yields 0 frames in offscreen.
  displayStream = await maybeAddMic(sourceStream, options.mic);

  if (displayStream.getVideoTracks().length === 0) {
    throw new Error('No video track from capture. Try Entire screen and pick your monitor.');
  }

  mediaRecorder = createRecorder(displayStream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    clearChunkTimer();
    // Stop capture tracks first so Chrome's "Stop sharing" bar dismisses immediately.
    stopAllStreams();
    await new Promise((r) => setTimeout(r, 200));

    const mimeType = mediaRecorder?.mimeType || 'video/webm';
    let blob = new Blob(recordedChunks, { type: mimeType });
    const durationMs = Date.now() - startedAt;
    const mode = currentOptions?.mode ?? 'picker';
    const { extension } = pickRecordingFormat();

    if (stopReason === 'track-ended' && blob.size < MIN_RECORDING_BYTES) {
      chrome.runtime.sendMessage({
        type: 'RECORDING_ERROR',
        error: trackEndedError(durationMs),
      } satisfies Message);
      mediaRecorder = null;
      currentOptions = null;
      stopReason = null;
      return;
    }

    if (durationMs < 800 && blob.size < 4096) {
      chrome.runtime.sendMessage({
        type: 'RECORDING_ERROR',
        error: trackEndedError(durationMs),
      } satisfies Message);
      mediaRecorder = null;
      currentOptions = null;
      stopReason = null;
      return;
    }

    if (blob.size < MIN_RECORDING_BYTES) {
      const secs = Math.round(durationMs / 1000);
      const chunkCount = recordedChunks.length;
      chrome.runtime.sendMessage({
        type: 'RECORDING_ERROR',
        error: `No video data captured (${blob.size} bytes, ${chunkCount} chunks, ${secs}s). Reload the extension, pick Entire screen, and keep the side panel open until you stop.`,
      } satisfies Message);
      mediaRecorder = null;
      currentOptions = null;
      stopReason = null;
      return;
    }

    blob = await finalizeRecordingBlob(blob, durationMs, mimeType);

    const id = crypto.randomUUID();
    await saveRecordingBlob(id, blob);

    chrome.runtime.sendMessage({
      type: 'RECORDING_COMPLETE',
      meta: {
        id,
        title: currentOptions?.tabTitle ?? 'Recording',
        durationMs,
        createdAt: Date.now(),
        mode,
        mimeType,
        fileExtension: extension,
        sizeBytes: blob.size,
      },
    } satisfies Message);

    mediaRecorder = null;
    currentOptions = null;
    stopReason = null;
  };

  mediaRecorder.onerror = () => {
    stopReason = 'error';
    chrome.runtime.sendMessage({
      type: 'RECORDING_ERROR',
      error: 'MediaRecorder failed. Reload the extension and try again.',
    } satisfies Message);
    stopAllStreams();
  };

  mediaRecorder.start(1000);

  chunkTimer = setInterval(() => {
    if (mediaRecorder?.state !== 'recording') return;
    try {
      mediaRecorder.requestData();
    } catch {
      // ignore
    }
  }, 5000);

  return displaySurface;
}

function stopRecording(): void {
  stopReason = stopReason ?? 'user';

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    stopAllStreams();
    return;
  }

  try {
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.requestData();
    }
  } catch {
    // ignore
  }

  setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }, 150);
}

chrome.runtime.onMessage.addListener((message: Message & { streamId?: string }, _sender, sendResponse) => {
  if (message.type === 'RECORDER_PING') {
    sendResponse('pong');
    return true;
  }

  if (message.type === 'OFFSCREEN_START') {
    startRecording(message.options, message.streamId)
      .then((displaySurface) => sendResponse({ ok: true, displaySurface }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to start recording',
        }),
      );
    return true;
  }

  switch (message.type) {
    case 'OFFSCREEN_STOP':
      stopRecording();
      sendResponse({ ok: true });
      break;
    case 'OFFSCREEN_PAUSE':
      if (mediaRecorder?.state === 'recording') mediaRecorder.pause();
      sendResponse({ ok: true });
      break;
    case 'OFFSCREEN_RESUME':
      if (mediaRecorder?.state === 'paused') mediaRecorder.resume();
      sendResponse({ ok: true });
      break;
    case 'OFFSCREEN_CANCEL':
      stopReason = 'user';
      recordedChunks = [];
      clearChunkTimer();
      if (mediaRecorder) {
        mediaRecorder.onstop = null;
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      }
      stopAllStreams();
      mediaRecorder = null;
      currentOptions = null;
      sendResponse({ ok: true });
      break;
  }

  return true;
});
