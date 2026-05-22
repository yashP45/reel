import type { RecordingOptions, RecordingMeta, StoredRecording, UploadProgress } from './types';

export type Message =
  | { type: 'GET_STATE' }
  | { type: 'GET_TARGET_TAB' }
  | { type: 'TARGET_TAB'; tab: { title: string; url: string; capturable: boolean; reason: string | null } }
  | { type: 'STATE_UPDATE'; state: AppState }
  | { type: 'START_RECORDING'; options: RecordingOptions }
  | { type: 'PREPARE_RECORDING'; options: Pick<RecordingOptions, 'mic' | 'webcam' | 'tabTitle'> }
  | { type: 'PREPARE_RECORDING_RESULT'; tabId: number; title: string }
  | { type: 'PANEL_START_CAPTURE' }
  | { type: 'RECORDING_STARTED'; startedAt: number; tabId: number; title: string; mic: boolean; webcam: boolean }
  | { type: 'OFFSCREEN_START'; options: RecordingOptions; streamId?: string }
  | { type: 'OFFSCREEN_STOP' }
  | { type: 'OFFSCREEN_PAUSE' }
  | { type: 'OFFSCREEN_RESUME' }
  | { type: 'OFFSCREEN_CANCEL' }
  | { type: 'CONTENT_PING' }
  | { type: 'MIC_UNAVAILABLE' }
  | { type: 'WEBCAM_UNAVAILABLE' }
  | { type: 'WEBCAM_READY' }
  | { type: 'WEBCAM_START' }
  | { type: 'WEBCAM_STOP' }
  | { type: 'WEBCAM_RELOCATE' }
  | { type: 'WEBCAM_REMOVE_IFRAME' }
  | { type: 'WEBCAM_MODE'; mode: 'pip' | 'iframe' }
  | { type: 'COUNTDOWN_TICK'; remaining: number }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'CANCEL_RECORDING' }
  | { type: 'RECORDING_COMPLETE'; meta: RecordingMeta; buffer?: ArrayBuffer }
  | { type: 'RECORDING_ERROR'; error: string }
  | { type: 'OVERLAY_SHOW'; options: Pick<RecordingOptions, 'mic'> }
  | { type: 'OVERLAY_HIDE' }
  | { type: 'OVERLAY_TICK'; elapsedMs: number }
  | { type: 'OVERLAY_PAUSED'; paused: boolean }
  | { type: 'UPLOAD_RECORDING'; recordingId?: string }
  | { type: 'OPEN_RECORDING'; recordingId: string }
  | { type: 'UPLOAD_PROGRESS'; progress: UploadProgress }
  | { type: 'OPEN_SIDE_PANEL' }
  | { type: 'WEBCAM_TOGGLE_PREVIEW'; enabled: boolean }
  | { type: 'RECORDER_PING' }
  | { type: 'RECORDER_PONG' };

export interface AppState {
  phase: import('./types').RecorderPhase;
  recordingTabId?: number;
  startedAt?: number;
  elapsedMs?: number;
  paused?: boolean;
  countdownRemaining?: number;
  currentRecording?: StoredRecording;
  uploadProgress?: UploadProgress;
  error?: string;
}

export function sendMessage<T = unknown>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

export function onMessage(
  handler: (message: Message, sender: chrome.runtime.MessageSender) => void | Promise<void>,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = handler(message as Message, sender);
    if (result instanceof Promise) {
      result.then(() => sendResponse(undefined)).catch(console.error);
      return true;
    }
    return undefined;
  });
}
