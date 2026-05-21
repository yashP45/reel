import type { Message } from '../../lib/messaging';
import type { RecordingOptions } from '../../lib/types';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let displayStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let startedAt = 0;
let currentOptions: RecordingOptions | null = null;

function stopAllStreams(): void {
  displayStream?.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop());
  displayStream = null;
  micStream = null;
}

async function getCapturedStream(streamId: string, source: 'tab' | 'desktop'): Promise<MediaStream> {
  const mediaSource = source === 'tab' ? 'tab' : 'desktop';
  const mandatory = {
    chromeMediaSource: mediaSource,
    chromeMediaSourceId: streamId,
  };

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { mandatory } as MediaTrackConstraints,
      video: { mandatory } as MediaTrackConstraints,
    });
  } catch (audioErr) {
    if (source !== 'tab') throw audioErr;
    return navigator.mediaDevices.getUserMedia({
      video: { mandatory } as MediaTrackConstraints,
    });
  }
}

async function getDisplayStream(mode: 'window' | 'screen'): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: mode === 'screen' ? 'monitor' : 'window',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: true,
  });
}

async function maybeAddMic(stream: MediaStream, enableMic: boolean): Promise<MediaStream> {
  if (!enableMic) return stream;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    const audioTracks = micStream.getAudioTracks();
    if (audioTracks.length > 0) {
      stream.addTrack(audioTracks[0]!);
    }
  } catch {
    chrome.runtime.sendMessage({ type: 'MIC_UNAVAILABLE' } satisfies Message).catch(() => {});
  }
  return stream;
}

async function startRecording(
  options: RecordingOptions,
  streamId?: string,
): Promise<void> {
  stopAllStreams();
  recordedChunks = [];
  currentOptions = options;
  startedAt = Date.now();

  if (streamId) {
    displayStream = await getCapturedStream(streamId, options.mode === 'tab' ? 'tab' : 'desktop');
  } else {
    displayStream = await getDisplayStream(options.mode === 'screen' ? 'screen' : 'window');
  }

  displayStream = await maybeAddMic(displayStream, options.mic);

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';

  mediaRecorder = new MediaRecorder(displayStream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    const durationMs = Date.now() - startedAt;
    const id = crypto.randomUUID();

    chrome.runtime.sendMessage({
      type: 'RECORDING_COMPLETE',
      meta: {
        id,
        title: currentOptions?.tabTitle ?? 'Recording',
        durationMs,
        createdAt: Date.now(),
        mode: currentOptions?.mode ?? 'tab',
        mimeType,
        sizeBytes: blob.size,
      },
      buffer,
    } satisfies Message);

    stopAllStreams();
    mediaRecorder = null;
    currentOptions = null;
  };

  mediaRecorder.onerror = () => {
    chrome.runtime.sendMessage({
      type: 'RECORDING_ERROR',
      error: 'MediaRecorder failed',
    } satisfies Message);
    stopAllStreams();
  };

  mediaRecorder.start(1000);
}

function stopRecording(): void {
  if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') {
    mediaRecorder.stop();
  }
}

chrome.runtime.onMessage.addListener((message: Message & { streamId?: string }, _sender, sendResponse) => {
  if (message.type === 'RECORDER_PING') {
    sendResponse('pong');
    return true;
  }

  switch (message.type) {
    case 'OFFSCREEN_START':
      startRecording(message.options, message.streamId).catch((err) => {
        chrome.runtime.sendMessage({
          type: 'RECORDING_ERROR',
          error: err instanceof Error ? err.message : 'Failed to start recording',
        });
      });
      break;
    case 'OFFSCREEN_STOP':
      stopRecording();
      break;
    case 'OFFSCREEN_PAUSE':
      if (mediaRecorder?.state === 'recording') mediaRecorder.pause();
      break;
    case 'OFFSCREEN_RESUME':
      if (mediaRecorder?.state === 'paused') mediaRecorder.resume();
      break;
    case 'OFFSCREEN_CANCEL':
      recordedChunks = [];
      if (mediaRecorder) {
        mediaRecorder.onstop = null;
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      }
      stopAllStreams();
      mediaRecorder = null;
      currentOptions = null;
      break;
  }

  return undefined;
});
