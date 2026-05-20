import type { AppState, Message } from '../lib/messaging';
import { onMessage } from '../lib/messaging';
import { setupOffscreenDocument } from '../lib/offscreen-manager';
import { arrayBufferToBase64, saveRecording, updateRecording } from '../lib/storage';
import { isSupabaseConfigured, uploadRecording } from '../lib/supabase';
import type { RecordingOptions, StoredRecording } from '../lib/types';

let state: AppState = { phase: 'idle' };
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let recordingTabId: number | undefined;
let pendingOptions: RecordingOptions | undefined;

function broadcastState(): void {
  const msg: Message = { type: 'STATE_UPDATE', state: { ...state } };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  broadcastState();
}

function clearTimers(): void {
  if (countdownTimer) clearInterval(countdownTimer);
  if (elapsedTimer) clearInterval(elapsedTimer);
  countdownTimer = null;
  elapsedTimer = null;
}

async function injectOverlay(tabId: number, options: Pick<RecordingOptions, 'webcam' | 'mic'>): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
  } catch {
    // Content script may already be registered on this tab
  }
  await chrome.tabs.sendMessage(tabId, {
    type: 'OVERLAY_SHOW',
    options,
  } as Message);
}

async function hideOverlay(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'OVERLAY_HIDE' } as Message);
  } catch {
    // tab may be closed
  }
}

async function startCountdown(options: RecordingOptions): Promise<void> {
  pendingOptions = options;
  recordingTabId = options.tabId;

  if (options.countdownSec > 0 && options.mode === 'tab') {
    await injectOverlay(options.tabId, { webcam: false, mic: options.mic });
  }

  if (options.countdownSec <= 0) {
    await beginRecording(options);
    return;
  }

  setState({
    phase: 'countdown',
    recordingTabId: options.tabId,
    countdownRemaining: options.countdownSec,
    error: undefined,
  });

  let remaining = options.countdownSec;
  chrome.tabs
    .sendMessage(options.tabId, { type: 'COUNTDOWN_TICK', remaining } as Message)
    .catch(() => {});

  countdownTimer = setInterval(async () => {
    remaining -= 1;
    if (remaining > 0) {
      setState({ countdownRemaining: remaining });
      chrome.tabs
        .sendMessage(options.tabId, { type: 'COUNTDOWN_TICK', remaining } as Message)
        .catch(() => {});
      return;
    }

    clearTimers();
    await beginRecording(options);
  }, 1000);
}

function chooseDesktopStream(
  tabId: number,
  sources: ('screen' | 'window' | 'tab')[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.desktopCapture.chooseDesktopMedia(sources, { targetTabId: tabId }, (streamId) => {
      if (!streamId) reject(new Error('Screen capture cancelled'));
      else resolve(streamId);
    });
  });
}

async function beginRecording(options: RecordingOptions): Promise<void> {
  await setupOffscreenDocument();
  await injectOverlay(options.tabId, { webcam: options.webcam, mic: options.mic });

  let streamId: string | undefined;
  if (options.mode === 'tab') {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: options.tabId });
  } else {
    const sources: ('screen' | 'window' | 'tab')[] =
      options.mode === 'screen' ? ['screen'] : ['window', 'tab'];
    streamId = await chooseDesktopStream(options.tabId, sources);
  }

  chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    options,
    streamId,
  } satisfies Message & { streamId?: string });

  const startedAt = Date.now();
  setState({
    phase: 'recording',
    startedAt,
    elapsedMs: 0,
    paused: false,
    recordingTabId: options.tabId,
  });

  chrome.runtime.sendMessage({ type: 'RECORDING_STARTED', startedAt } as Message).catch(() => {});

  elapsedTimer = setInterval(() => {
    if (state.paused || !state.startedAt) return;
    const elapsedMs = Date.now() - state.startedAt;
    setState({ elapsedMs });
    if (recordingTabId) {
      chrome.tabs.sendMessage(recordingTabId, {
        type: 'OVERLAY_TICK',
        elapsedMs,
      } as Message).catch(() => {});
    }
  }, 250);
}

async function handleRecordingComplete(
  meta: StoredRecording,
  buffer: ArrayBuffer,
): Promise<void> {
  clearTimers();
  if (recordingTabId) await hideOverlay(recordingTabId);

  const dataBase64 = arrayBufferToBase64(buffer);
  const recording: StoredRecording = {
    ...meta,
    dataBase64,
    uploadStatus: isSupabaseConfigured() ? 'pending' : 'error',
    uploadError: isSupabaseConfigured() ? undefined : 'Supabase not configured',
  };

  await saveRecording(recording);

  setState({
    phase: 'preview',
    currentRecording: recording,
    recordingTabId: undefined,
    paused: undefined,
    startedAt: undefined,
    elapsedMs: undefined,
  });

  if (isSupabaseConfigured()) {
    void uploadInBackground(recording);
  }
}

async function uploadInBackground(recording: StoredRecording): Promise<void> {
  if (!recording.dataBase64) return;

  setState({
    phase: 'uploading',
    uploadProgress: { recordingId: recording.id, percent: 0, status: 'uploading' },
  });

  await updateRecording(recording.id, { uploadStatus: 'uploading' });

  try {
    const binary = atob(recording.dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: recording.mimeType });

    const { shareUrl, storagePath } = await uploadRecording(recording, blob, (percent) => {
      const progress = { recordingId: recording.id, percent, status: 'uploading' as const };
      setState({ uploadProgress: progress });
      chrome.runtime.sendMessage({ type: 'UPLOAD_PROGRESS', progress } as Message).catch(() => {});
    });

    const updated = await updateRecording(recording.id, {
      shareUrl,
      storagePath,
      uploadStatus: 'done',
    });

    const progress = {
      recordingId: recording.id,
      percent: 100,
      status: 'done' as const,
      shareUrl,
    };

    setState({
      phase: 'preview',
      currentRecording: updated ?? { ...recording, shareUrl, storagePath, uploadStatus: 'done' },
      uploadProgress: progress,
    });
    chrome.runtime.sendMessage({ type: 'UPLOAD_PROGRESS', progress } as Message).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    await updateRecording(recording.id, { uploadStatus: 'error', uploadError: message });
    const progress = {
      recordingId: recording.id,
      percent: 0,
      status: 'error' as const,
      error: message,
    };
    setState({
      phase: 'preview',
      uploadProgress: progress,
      error: message,
    });
    chrome.runtime.sendMessage({ type: 'UPLOAD_PROGRESS', progress } as Message).catch(() => {});
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return tab;
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  onMessage(async (message, sender) => {
    switch (message.type) {
      case 'GET_STATE':
        broadcastState();
        break;

      case 'OPEN_SIDE_PANEL': {
        const tab = await getActiveTab();
        await chrome.sidePanel.open({ tabId: tab.id });
        break;
      }

      case 'START_RECORDING': {
        if (state.phase !== 'idle' && state.phase !== 'preview') return;
        await startCountdown(message.options);
        break;
      }

      case 'STOP_RECORDING':
        chrome.runtime.sendMessage({ type: 'STOP_RECORDING' } as Message);
        setState({ phase: 'processing' });
        break;

      case 'PAUSE_RECORDING':
        chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' } as Message);
        setState({ paused: true });
        if (recordingTabId) {
          chrome.tabs.sendMessage(recordingTabId, {
            type: 'OVERLAY_PAUSED',
            paused: true,
          } as Message).catch(() => {});
        }
        break;

      case 'RESUME_RECORDING':
        chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' } as Message);
        setState({ paused: false });
        if (recordingTabId) {
          chrome.tabs.sendMessage(recordingTabId, {
            type: 'OVERLAY_PAUSED',
            paused: false,
          } as Message).catch(() => {});
        }
        break;

      case 'CANCEL_RECORDING':
        clearTimers();
        chrome.runtime.sendMessage({ type: 'CANCEL_RECORDING' } as Message);
        if (recordingTabId) await hideOverlay(recordingTabId);
        recordingTabId = undefined;
        pendingOptions = undefined;
        setState({
          phase: 'idle',
          recordingTabId: undefined,
          currentRecording: undefined,
          uploadProgress: undefined,
          error: undefined,
        });
        break;

      case 'RECORDING_COMPLETE':
        if (sender.id !== chrome.runtime.id) return;
        await handleRecordingComplete(
          {
            id: message.meta.id,
            title: message.meta.title,
            durationMs: message.meta.durationMs,
            createdAt: message.meta.createdAt,
            mode: message.meta.mode,
            mimeType: message.meta.mimeType,
            sizeBytes: message.meta.sizeBytes,
            uploadStatus: 'pending',
          },
          message.buffer,
        );
        break;

      case 'RECORDING_ERROR':
        clearTimers();
        if (recordingTabId) await hideOverlay(recordingTabId);
        setState({ phase: 'idle', error: message.error });
        break;

      case 'UPLOAD_RECORDING':
        if (state.currentRecording) void uploadInBackground(state.currentRecording);
        break;

      case 'RECORDER_PING':
        if (sender.url?.includes('offscreen')) {
          chrome.runtime.sendMessage({ type: 'RECORDER_PONG' } as Message);
        }
        break;
    }
  });

  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'record-tab') return;
    const tab = await getActiveTab();
    if (!tab.id) return;
    await chrome.sidePanel.open({ tabId: tab.id });
    await startCountdown({
      mode: 'tab',
      mic: true,
      webcam: false,
      tabId: tab.id,
      tabTitle: tab.title ?? 'Recording',
      countdownSec: 3,
    });
  });

});
