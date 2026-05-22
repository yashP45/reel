import type { AppState, Message } from '../lib/messaging';
import { onMessage } from '../lib/messaging';
import { getTargetTabInfo, isCapturableUrl, resolveRecordingTab } from '../lib/capture';
import { saveRecordingBlob, getRecordingBlob } from '../lib/blob-store';
import { finalizeRecordingBlob } from '../lib/fix-webm-blob';
import { isSupabaseConfigured } from '../lib/config';
import { MIN_RECORDING_BYTES } from '../lib/recording-format';
import { getRecording, saveRecording, updateRecording } from '../lib/storage';
import { setAuthSession, type AuthSession } from '../lib/auth-storage';
import { uploadRecording } from '../lib/supabase';
import { sendToTab } from '../lib/tab-messaging';
import { setWebcamSessionActive } from '../lib/webcam-session';
import type { RecordingOptions, StoredRecording } from '../lib/types';

let state: AppState = { phase: 'idle' };
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let recordingTabId: number | undefined;
let webcamHostTabId: number | undefined;
let recordingOverlayOptions: Pick<RecordingOptions, 'webcam' | 'mic'> = {
  webcam: false,
  mic: true,
};

async function stopWebcamBubble(): Promise<void> {
  const tabIds = new Set<number>();
  if (recordingTabId != null) tabIds.add(recordingTabId);
  if (webcamHostTabId != null) tabIds.add(webcamHostTabId);
  for (const id of tabIds) {
    await sendToTab(id, { type: 'WEBCAM_STOP' });
  }
  webcamHostTabId = undefined;
  setWebcamSessionActive(false);
}

async function hideAllOverlays(): Promise<void> {
  if (recordingTabId != null) await hideOverlay(recordingTabId);
  await stopWebcamBubble();
  recordingTabId = undefined;
}

function tabUrl(tab: chrome.tabs.Tab): string | undefined {
  return tab.url ?? tab.pendingUrl;
}

function isRecordingPhase(): boolean {
  return state.phase === 'recording' || state.phase === 'paused';
}

async function moveOverlayToTab(newTabId: number): Promise<void> {
  if (newTabId === recordingTabId) return;

  const tab = await chrome.tabs.get(newTabId);
  if (!isCapturableUrl(tabUrl(tab))) return;

  const oldTabId = recordingTabId;
  recordingTabId = newTabId;

  if (oldTabId != null) {
    await hideOverlay(oldTabId);
    if (recordingOverlayOptions.webcam) {
      await sendToTab(oldTabId, { type: 'WEBCAM_REMOVE_IFRAME' });
    }
  }
  await injectOverlay(newTabId, { mic: recordingOverlayOptions.mic });
  if (recordingOverlayOptions.webcam) {
    await sendToTab(newTabId, { type: 'WEBCAM_RELOCATE' });
    webcamHostTabId = newTabId;
  }

  if (state.elapsedMs != null) {
    await sendToTab(newTabId, { type: 'OVERLAY_TICK', elapsedMs: state.elapsedMs });
  }
  if (state.paused) {
    await sendToTab(newTabId, { type: 'OVERLAY_PAUSED', paused: true });
  }
}

async function onActiveTabChanged(tabId: number): Promise<void> {
  if (!isRecordingPhase()) return;
  try {
    await moveOverlayToTab(tabId);
  } catch {
    // Tab may not be injectable yet
  }
}

function broadcastState(): void {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state: { ...state } } satisfies Message).catch(() => {});
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

async function injectOverlay(tabId: number, options: Pick<RecordingOptions, 'mic'>): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
  await sendToTab(tabId, {
    type: 'OVERLAY_SHOW',
    options: { mic: options.mic },
  });
}

async function hideOverlay(tabId: number): Promise<void> {
  await sendToTab(tabId, { type: 'OVERLAY_HIDE' });
}

async function onRecordingStarted(
  tabId: number,
  title: string,
  options: Pick<RecordingOptions, 'webcam' | 'mic'>,
): Promise<void> {
  recordingOverlayOptions = { webcam: options.webcam, mic: options.mic };
  recordingTabId = tabId;
  void injectOverlay(tabId, { mic: options.mic });

  if (options.webcam) {
    webcamHostTabId = tabId;
    setWebcamSessionActive(true);
    void sendToTab(tabId, { type: 'WEBCAM_START' });
  }

  const startedAt = Date.now();
  setState({
    phase: 'recording',
    startedAt,
    elapsedMs: 0,
    paused: false,
    recordingTabId: tabId,
    error: undefined,
  });

  elapsedTimer = setInterval(() => {
    if (state.paused || !state.startedAt) return;
    const elapsedMs = Date.now() - state.startedAt;
    setState({ elapsedMs });
    if (recordingTabId) {
      void sendToTab(recordingTabId, { type: 'OVERLAY_TICK', elapsedMs });
    }
  }, 250);
}

async function prepareRecordingTab(
  options: Pick<RecordingOptions, 'mic' | 'webcam' | 'tabTitle'>,
): Promise<{ tabId: number; title: string }> {
  const tab = await resolveRecordingTab();
  recordingTabId = tab.id!;
  setState({ phase: 'processing', error: undefined });
  return { tabId: tab.id!, title: tab.title ?? options.tabTitle ?? 'Recording' };
}

function formatRecordingFailure(meta: StoredRecording, blobSize: number): string {
  const secs = Math.round(meta.durationMs / 1000);
  const expectedKb = Math.round(meta.sizeBytes / 1024);
  const gotKb = Math.round(blobSize / 1024);

  if (meta.sizeBytes >= MIN_RECORDING_BYTES && blobSize < MIN_RECORDING_BYTES) {
    return `Recording data was lost after capture (${gotKb} KB received, ${expectedKb} KB recorded, ${secs}s). Reload the extension and try again.`;
  }

  return `No usable video was captured (${gotKb} KB after ${secs}s). Try Full screen mode, keep the shared window open, then stop.`;
}

async function handleRecordingComplete(
  meta: StoredRecording,
  buffer?: ArrayBuffer,
): Promise<void> {
  clearTimers();
  await hideAllOverlays();

  let blob: Blob | null = null;

  if (buffer && buffer.byteLength > 0) {
    blob = new Blob([buffer], { type: meta.mimeType });
  } else {
    blob = await getRecordingBlob(meta.id);
  }

  if (!blob || blob.size < MIN_RECORDING_BYTES) {
    setState({
      phase: 'idle',
      error: formatRecordingFailure(meta, blob?.size ?? 0),
      currentRecording: undefined,
    });
    return;
  }

  const finalized = await finalizeRecordingBlob(blob, meta.durationMs, meta.mimeType);
  await saveRecordingBlob(meta.id, finalized);

  const recording: StoredRecording = {
    ...meta,
    sizeBytes: finalized.size,
    uploadStatus: isSupabaseConfigured() ? 'pending' : 'local',
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
  const blob = await getRecordingBlob(recording.id);
  if (!blob) return;

  if (blob.size < MIN_RECORDING_BYTES) {
    const message = 'Recording file is too small to upload. Record again.';
    await updateRecording(recording.id, { uploadStatus: 'error', uploadError: message });
    setState({
      phase: 'preview',
      uploadProgress: {
        recordingId: recording.id,
        percent: 0,
        status: 'error',
        error: message,
      },
      error: message,
    });
    return;
  }

  setState({
    phase: 'uploading',
    uploadProgress: { recordingId: recording.id, percent: 0, status: 'uploading' },
  });

  await updateRecording(recording.id, { uploadStatus: 'uploading' });

  try {
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
    const updated = await updateRecording(recording.id, {
      uploadStatus: 'error',
      uploadError: message,
    });
    setState({
      phase: 'preview',
      currentRecording: updated ?? {
        ...recording,
        uploadStatus: 'error',
        uploadError: message,
      },
      uploadProgress: {
        recordingId: recording.id,
        percent: 0,
        status: 'error',
        error: message,
      },
      error: message,
    });
    chrome.runtime
      .sendMessage({
        type: 'UPLOAD_PROGRESS',
        progress: {
          recordingId: recording.id,
          percent: 0,
          status: 'error',
          error: message,
        },
      } as Message)
      .catch(() => {});
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return tab;
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'REEL_AUTH_SESSION' && message.session) {
      void setAuthSession(message.session as AuthSession).then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  onMessage(async (message, sender) => {
    switch (message.type) {
      case 'GET_STATE':
        broadcastState();
        break;

      case 'GET_TARGET_TAB': {
        const tab = await getTargetTabInfo();
        chrome.runtime.sendMessage({ type: 'TARGET_TAB', tab } satisfies Message).catch(() => {});
        break;
      }

      case 'PREPARE_RECORDING': {
        try {
          const tab = await prepareRecordingTab(message.options);
          chrome.runtime
            .sendMessage({
              type: 'PREPARE_RECORDING_RESULT',
              tabId: tab.tabId,
              title: tab.title,
            } satisfies Message)
            .catch(() => {});
        } catch (err) {
          setState({
            phase: 'idle',
            error: err instanceof Error ? err.message : 'Failed to start recording',
          });
        }
        break;
      }

      case 'RECORDING_STARTED':
        await onRecordingStarted(message.tabId, message.title, {
          webcam: message.webcam,
          mic: message.mic,
        });
        break;

      case 'STOP_RECORDING':
        setState({ phase: 'processing' });
        break;

      case 'PAUSE_RECORDING':
        setState({ paused: true });
        if (recordingTabId) await sendToTab(recordingTabId, { type: 'OVERLAY_PAUSED', paused: true });
        break;

      case 'RESUME_RECORDING':
        setState({ paused: false });
        if (recordingTabId) await sendToTab(recordingTabId, { type: 'OVERLAY_PAUSED', paused: false });
        break;

      case 'CANCEL_RECORDING':
        clearTimers();
        await hideAllOverlays();
        setState({
          phase: 'idle',
          recordingTabId: undefined,
          currentRecording: undefined,
          uploadProgress: undefined,
          error: undefined,
        });
        break;

      case 'RECORDING_COMPLETE': {
        const fromPanel = sender.url?.includes('sidepanel');
        const fromOffscreen = sender.url?.includes('offscreen');
        if (!fromPanel && !fromOffscreen) return;
        await handleRecordingComplete(
          {
            id: message.meta.id,
            title: message.meta.title,
            durationMs: message.meta.durationMs,
            createdAt: message.meta.createdAt,
            mode: message.meta.mode,
            mimeType: message.meta.mimeType,
            fileExtension: message.meta.fileExtension,
            sizeBytes: message.meta.sizeBytes,
            uploadStatus: 'pending',
          },
          message.buffer,
        );
        break;
      }

      case 'RECORDING_ERROR':
        clearTimers();
        await hideAllOverlays();
        setState({ phase: 'idle', error: message.error });
        break;

      case 'MIC_UNAVAILABLE':
        if (state.phase === 'recording') {
          setState({ error: 'Microphone blocked — recording without mic audio.' });
        }
        break;

      case 'WEBCAM_UNAVAILABLE':
        if (state.phase === 'recording') {
          setState({ error: 'Webcam blocked — recording without camera bubble.' });
        }
        break;

      case 'UPLOAD_RECORDING': {
        const id = message.recordingId ?? state.currentRecording?.id;
        if (!id) break;
        const rec =
          state.currentRecording?.id === id
            ? state.currentRecording
            : await getRecording(id);
        if (rec) {
          if (state.currentRecording?.id !== id) {
            setState({ phase: 'preview', currentRecording: rec });
          }
          void uploadInBackground(rec);
        }
        break;
      }

      case 'OPEN_RECORDING': {
        const rec = await getRecording(message.recordingId);
        if (!rec) break;
        const uploadProgress =
          rec.uploadStatus === 'error'
            ? {
                recordingId: rec.id,
                percent: 0,
                status: 'error' as const,
                error: rec.uploadError ?? 'Upload failed',
              }
            : rec.uploadStatus === 'done' && rec.shareUrl
              ? {
                  recordingId: rec.id,
                  percent: 100,
                  status: 'done' as const,
                  shareUrl: rec.shareUrl,
                }
              : undefined;
        setState({
          phase: 'preview',
          currentRecording: rec,
          uploadProgress,
          error: rec.uploadStatus === 'error' ? rec.uploadError : undefined,
        });
        break;
      }
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    void onActiveTabChanged(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete' || !isRecordingPhase()) return;
    void (async () => {
      const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (active?.id === tabId) await onActiveTabChanged(tabId);
    })();
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId !== webcamHostTabId) return;
    webcamHostTabId = undefined;
    if (isRecordingPhase()) {
      setState({ error: 'Camera tab closed — webcam bubble ended.' });
    }
  });

  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'record-tab') return;
    try {
      const tab = await getActiveTab();
      if (!tab.id) return;
      await chrome.sidePanel.open({ tabId: tab.id });
      chrome.runtime.sendMessage({ type: 'PANEL_START_CAPTURE' } satisfies Message).catch(() => {});
    } catch (err) {
      setState({
        phase: 'idle',
        error: err instanceof Error ? err.message : 'Failed to start recording',
      });
    }
  });
});
