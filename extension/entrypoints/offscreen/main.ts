import { saveRecordingBlob } from '../../lib/blob-store';
import type { Message } from '../../lib/messaging';
import { pumpStreamThroughCanvas } from '../../lib/stream-pump';
import type { RecordingOptions } from '../../lib/types';
import { MIN_RECORDING_BYTES, pickRecordingFormat } from '../../lib/recording-format';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let displayStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let pumpStop: (() => void) | null = null;
let startedAt = 0;
let currentOptions: RecordingOptions | null = null;
let stopReason: 'user' | 'track-ended' | 'error' | null = null;

const CAPTURE_ROOT_ID = 'reel-capture-root';

function getCaptureRoot(): HTMLElement {
  let root = document.getElementById(CAPTURE_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = CAPTURE_ROOT_ID;
    root.style.cssText =
      'position:fixed;left:0;top:0;width:1280px;height:720px;overflow:hidden;pointer-events:none;opacity:0;z-index:-1;';
    document.body.appendChild(root);
  }
  return root;
}

function stopPump(): void {
  pumpStop?.();
  pumpStop = null;
}

function stopAllStreams(): void {
  stopPump();
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
        mediaRecorder.stop();
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

async function getDisplayPickerStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: true,
  });
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

async function prepareDisplayStream(sourceStream: MediaStream): Promise<MediaStream> {
  const videoTrack = sourceStream.getVideoTracks()[0];
  if (!videoTrack) return sourceStream;

  try {
    const handle = await pumpStreamThroughCanvas(sourceStream, getCaptureRoot(), 30);
    pumpStop = handle.stop;
    return handle.stream;
  } catch {
    return sourceStream;
  }
}

async function startRecording(options: RecordingOptions, streamId?: string): Promise<void> {
  stopAllStreams();
  recordedChunks = [];
  currentOptions = options;
  startedAt = Date.now();
  stopReason = null;

  let sourceStream: MediaStream;
  if (streamId) {
    sourceStream = await getDesktopStream(streamId);
  } else {
    try {
      sourceStream = await getDisplayPickerStream();
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError') {
        throw new Error('Share cancelled — pick a tab, window, or screen to record.');
      }
      throw err;
    }
  }

  watchCaptureTracks(sourceStream);

  displayStream = await prepareDisplayStream(sourceStream);
  displayStream = await maybeAddMic(displayStream, options.mic);

  if (displayStream.getVideoTracks().length === 0) {
    throw new Error('No video track from capture. Try Full screen mode and pick your monitor.');
  }

  mediaRecorder = createRecorder(displayStream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    await new Promise((r) => setTimeout(r, 150));

    const mimeType = mediaRecorder?.mimeType || 'video/webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    const durationMs = Date.now() - startedAt;
    const mode = currentOptions?.mode ?? 'picker';
    const { extension } = pickRecordingFormat();

    if (stopReason === 'track-ended' || (durationMs < 800 && blob.size < 4096)) {
      chrome.runtime.sendMessage({
        type: 'RECORDING_ERROR',
        error: trackEndedError(durationMs),
      } satisfies Message);
      stopAllStreams();
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
        error: `No video data captured (${blob.size} bytes, ${chunkCount} chunks, ${secs}s). Reload the extension, use Full screen mode, and pick the window or monitor you are recording.`,
      } satisfies Message);
      stopAllStreams();
      mediaRecorder = null;
      currentOptions = null;
      stopReason = null;
      return;
    }

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

    stopAllStreams();
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

  mediaRecorder.start(500);
}

function stopRecording(): void {
  stopReason = 'user';
  if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') {
    if (mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.requestData();
      } catch {
        // ignore
      }
    }
    mediaRecorder.stop();
  }
}

chrome.runtime.onMessage.addListener((message: Message & { streamId?: string }, _sender, sendResponse) => {
  if (message.type === 'RECORDER_PING') {
    sendResponse('pong');
    return true;
  }

  if (message.type === 'OFFSCREEN_START') {
    startRecording(message.options, message.streamId)
      .then(() => sendResponse({ ok: true }))
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
