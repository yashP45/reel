import { useCallback, useEffect, useState } from 'react';
import { Toggle } from '../../components/Toggle';
import type { AppState, Message } from '../../lib/messaging';
import { sendMessage } from '../../lib/messaging';
import { getRecordingBlob, saveRecordingBlob } from '../../lib/blob-store';
import {
  cancelPanelRecording,
  isPanelRecording,
  pausePanelRecording,
  resumePanelRecording,
  startPanelRecording,
  stopPanelRecording,
} from '../../lib/panel-recorder';
import { isSupabaseConfigured, getSharePageUrl } from '../../lib/config';
import { getAuthSession, clearAuthSession } from '../../lib/auth-storage';
import type { AuthSession } from '../../lib/auth-storage';
import { getLibrary } from '../../lib/storage';
import type { StoredRecording } from '../../lib/types';

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function isAuthRelatedError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('row-level security') ||
    lower.includes('rls') ||
    lower.includes('jwt') ||
    lower.includes('permission') ||
    lower.includes('not authorized') ||
    lower.includes('unauthorized')
  );
}

function uploadStatusLabel(status: StoredRecording['uploadStatus']): string {
  switch (status) {
    case 'uploading':
      return 'Uploading';
    case 'done':
      return 'Shared';
    case 'error':
      return 'Upload failed';
    case 'pending':
      return 'Pending';
    default:
      return 'Local only';
  }
}

function uploadStatusClass(status: StoredRecording['uploadStatus']): string {
  switch (status) {
    case 'done':
      return 'bg-emerald-500/15 text-emerald-300';
    case 'error':
      return 'bg-red-500/15 text-red-300';
    case 'uploading':
      return 'bg-indigo-500/15 text-indigo-300';
    default:
      return 'bg-zinc-700/50 text-zinc-400';
  }
}

export default function App() {
  const [state, setState] = useState<AppState>({ phase: 'idle' });
  const [mic, setMic] = useState(true);
  const [webcam, setWebcam] = useState(false);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [library, setLibrary] = useState<StoredRecording[]>([]);
  const [copied, setCopied] = useState(false);
  const [targetTab, setTargetTab] = useState<{
    title: string;
    url: string;
    capturable: boolean;
    reason: string | null;
  } | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [webcamHint, setWebcamHint] = useState<string | null>(null);

  const refreshTargetTab = useCallback(async () => {
    await sendMessage({ type: 'GET_TARGET_TAB' });
  }, []);

  const refreshLibrary = useCallback(async () => {
    setLibrary(await getLibrary());
  }, []);

  const runPanelCapture = useCallback(() => {
    if (captureBusy || isPanelRecording()) return;
    setCaptureBusy(true);

    // getDisplayMedia must run in the same click turn — no await before startPanelRecording
    void startPanelRecording(mic, {
      onStarted: () => {
        void (async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = tab?.id;
          if (!tabId) {
            cancelPanelRecording();
            void sendMessage({ type: 'RECORDING_ERROR', error: 'No active tab for overlay.' });
            return;
          }
          void sendMessage({
            type: 'RECORDING_STARTED',
            startedAt: Date.now(),
            tabId,
            title: tab.title ?? targetTab?.title ?? 'Recording',
            mic,
            webcam,
          });
        })();
      },
      onComplete: async (meta, buffer) => {
        const blob = new Blob([buffer], { type: meta.mimeType });
        await saveRecordingBlob(meta.id, blob);
        void sendMessage({
          type: 'RECORDING_COMPLETE',
          meta: { ...meta, title: targetTab?.title ?? meta.title },
        });
      },
      onError: (error) => {
        void sendMessage({ type: 'RECORDING_ERROR', error });
      },
    }).finally(() => setCaptureBusy(false));
  }, [captureBusy, mic, webcam, targetTab?.title]);

  useEffect(() => {
    getAuthSession().then(setAuth);
    sendMessage({ type: 'GET_STATE' });
    refreshLibrary();
    refreshTargetTab();

    const listener = (message: Message) => {
      if (message.type === 'STATE_UPDATE') setState(message.state);
      if (message.type === 'TARGET_TAB') setTargetTab(message.tab);
      if (
        message.type === 'UPLOAD_PROGRESS' &&
        (message.progress.status === 'done' || message.progress.status === 'error')
      ) {
        refreshLibrary();
      }
      if (message.type === 'PANEL_START_CAPTURE') {
        runPanelCapture();
      }
      if (message.type === 'STATE_UPDATE' && message.state.phase === 'idle' && captureBusy) {
        setCaptureBusy(false);
      }
      if (message.type === 'STOP_RECORDING' && isPanelRecording()) {
        stopPanelRecording();
      }
      if (message.type === 'PAUSE_RECORDING' && isPanelRecording()) {
        pausePanelRecording();
      }
      if (message.type === 'RESUME_RECORDING' && isPanelRecording()) {
        resumePanelRecording();
      }
      if (message.type === 'CANCEL_RECORDING') {
        cancelPanelRecording();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    const onFocus = () => {
      refreshTargetTab();
      getAuthSession().then(setAuth);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshLibrary, refreshTargetTab, captureBusy, runPanelCapture]);

  const handleWebcamToggle = (enabled: boolean) => {
    setWebcam(enabled);
    setWebcamHint(null);
    if (!enabled) return;

    // Side panel often cannot access the camera — do not revert the toggle.
    // Permission is requested on the active page when the overlay shows.
    void navigator.mediaDevices
      .getUserMedia({
        video: { width: 320, height: 320, facingMode: 'user' },
        audio: false,
      })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        setWebcamHint(null);
      })
      .catch(() => {
        setWebcamHint(
          'Camera is requested once when recording starts. The bubble stays on screen like Loom.',
        );
      });
  };

  const openSignIn = () => {
    const base = getSharePageUrl() || 'http://localhost:3000';
    chrome.tabs.create({ url: `${base.replace(/\/$/, '')}/login?ext=1` });
  };

  const signOut = async () => {
    await clearAuthSession();
    setAuth(null);
  };

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const recordingId = state.currentRecording?.id;

    if (!recordingId || (state.phase !== 'preview' && state.phase !== 'uploading')) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewError(null);
      return;
    }

    setPreviewError(null);
    getRecordingBlob(recordingId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setPreviewUrl(null);
          setPreviewError('Recording file not found. Try recording again.');
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewUrl(null);
        setPreviewError('Could not load preview.');
      });

    return () => {
      cancelled = true;
    };
  }, [state.currentRecording?.id, state.phase]);

  const copyLink = async () => {
    const url = state.currentRecording?.shareUrl ?? state.uploadProgress?.shareUrl;
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    if (!previewUrl || !state.currentRecording) return;
    const ext = state.currentRecording.fileExtension ?? 'webm';
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `${state.currentRecording.title.replace(/[^\w.-]+/g, '-')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const reset = () => {
    sendMessage({ type: 'CANCEL_RECORDING' });
    setState({ phase: 'idle' });
  };

  const retryUpload = () => {
    const id = state.currentRecording?.id;
    if (!id) return;
    void sendMessage({ type: 'UPLOAD_RECORDING', recordingId: id });
  };

  const openLibraryRecording = (id: string) => {
    void sendMessage({ type: 'OPEN_RECORDING', recordingId: id });
  };

  const phase = state.phase;
  const recording = state.currentRecording;
  const shareUrl = recording?.shareUrl ?? state.uploadProgress?.shareUrl;
  const uploading = phase === 'uploading' || recording?.uploadStatus === 'uploading';
  const uploadPercent = state.uploadProgress?.percent ?? 0;
  const uploadFailed =
    state.uploadProgress?.status === 'error' || recording?.uploadStatus === 'error';
  const uploadErrorMessage =
    state.uploadProgress?.error ?? recording?.uploadError ?? state.error;
  const showGuestSuccessBanner =
    !auth && shareUrl && state.uploadProgress?.status === 'done';
  const showAuthHintOnError = uploadFailed && isAuthRelatedError(uploadErrorMessage);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800/80 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-lg font-bold text-white">
              R
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Reel</h1>
              <p className="text-xs text-zinc-500">Record & share in seconds</p>
            </div>
          </div>
          {auth ? (
            <button
              type="button"
              onClick={signOut}
              className="text-xs text-zinc-500 hover:text-zinc-300"
              title={auth.email}
            >
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={openSignIn}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium hover:bg-zinc-800"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-5">
        {phase === 'idle' && (
          <>
            <p className="rounded-xl border border-zinc-700/80 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
              Open a normal website (https://), then click Record and choose what to share in Chrome&apos;s dialog.
            </p>

            <section className="space-y-2">
              <Toggle label="Microphone" icon="🎤" checked={mic} onChange={setMic} />
              <Toggle
                label="Webcam bubble"
                icon="📷"
                checked={webcam}
                onChange={handleWebcamToggle}
              />
              {webcam && (
                <p className="text-xs text-zinc-500">
                  Camera bubble floats on screen (one permission). Pause/stop bar follows the active tab.
                </p>
              )}
              {webcamHint && (
                <p className="text-xs text-amber-200/90">{webcamHint}</p>
              )}
            </section>

            <button
              type="button"
              onClick={runPanelCapture}
              className="mt-auto w-full rounded-xl bg-indigo-500 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
            >
              Record
            </button>
            {!auth && (
              <p className="text-center text-xs text-zinc-500">
                No account needed. Sign in to save recordings to your dashboard.
              </p>
            )}
            <p className="text-center text-xs text-zinc-600">
              Shortcut: <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">Alt+Shift+R</kbd> — opens the same picker
            </p>
          </>
        )}

        {phase === 'countdown' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <p className="text-6xl font-bold text-indigo-400">{state.countdownRemaining ?? 3}</p>
            <p className="text-sm text-zinc-500">Starting recording…</p>
            <button type="button" onClick={reset} className="text-sm text-zinc-500 hover:text-zinc-300">
              Cancel
            </button>
          </div>
        )}

        {(phase === 'recording' || phase === 'paused') && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="text-lg font-semibold">
                {state.paused ? 'Paused' : 'Recording'} · {formatTime(state.elapsedMs ?? 0)}
              </span>
            </div>
            <p className="max-w-[260px] text-center text-sm text-zinc-500">
              {webcam
                ? 'Webcam bubble stays visible while you browse. Controls follow the active tab.'
                : 'Controls follow the active tab.'}{' '}
              Or use the buttons below.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (state.paused) {
                    resumePanelRecording();
                    void sendMessage({ type: 'RESUME_RECORDING' });
                  } else {
                    pausePanelRecording();
                    void sendMessage({ type: 'PAUSE_RECORDING' });
                  }
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800"
              >
                {state.paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopPanelRecording();
                  void sendMessage({ type: 'STOP_RECORDING' });
                }}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400"
              >
                Stop
              </button>
            </div>
          </div>
        )}

        {phase === 'processing' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-zinc-400">Please wait…</p>
          </div>
        )}

        {phase === 'preview' || phase === 'uploading' ? (
          <div className="flex flex-1 flex-col gap-4">
            <h2 className="text-sm font-semibold text-zinc-300">
              {recording?.title ?? 'Preview'}
            </h2>
            {previewUrl && (
              <video
                src={previewUrl}
                controls
                className="w-full rounded-xl border border-zinc-800 bg-black"
              />
            )}
            {previewError && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{previewError}</p>
            )}
            {uploading && (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500">Uploading… {uploadPercent}%</p>
              </div>
            )}
            {!isSupabaseConfigured() && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Share links need Supabase in extension/.env — then run <code className="font-mono">npm run build</code> and reload the extension.
              </p>
            )}
            {showGuestSuccessBanner && (
              <p className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
                Your share link is ready. Sign in to manage recordings on the web dashboard.
              </p>
            )}
            {uploadFailed && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-red-200">Upload failed</p>
                  <p className="mt-1 text-xs text-red-300/90">
                    {uploadErrorMessage ?? 'Could not upload your recording.'}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Your recording is saved locally — you can retry or download it.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {isSupabaseConfigured() && (
                    <button
                      type="button"
                      onClick={retryUpload}
                      disabled={uploading}
                      className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
                    >
                      Retry upload
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={download}
                    disabled={!previewUrl}
                    className="w-full rounded-lg border border-zinc-600 py-2.5 text-sm font-medium hover:bg-zinc-800/80 disabled:opacity-40"
                  >
                    Download .{recording?.fileExtension ?? 'webm'}
                  </button>
                  {showAuthHintOnError && (
                    <button
                      type="button"
                      onClick={openSignIn}
                      className="w-full rounded-lg border border-indigo-500/40 py-2.5 text-sm font-medium text-indigo-200 hover:bg-indigo-500/10"
                    >
                      Sign in and retry
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {!uploadFailed && (
                <button
                  type="button"
                  onClick={copyLink}
                  disabled={!shareUrl}
                  className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-indigo-400"
                >
                  {copied ? 'Copied!' : 'Copy share link'}
                </button>
              )}
              {!uploadFailed && (
                <button
                  type="button"
                  onClick={download}
                  disabled={!previewUrl}
                  className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-medium hover:bg-zinc-800 disabled:opacity-40"
                >
                  Download .{recording?.fileExtension ?? 'webm'}
                </button>
              )}
              <button
                type="button"
                onClick={reset}
                className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300"
              >
                Record again
              </button>
            </div>
          </div>
        ) : null}

        {library.length > 0 && (phase === 'idle' || phase === 'preview') && (
          <section className="mt-2 border-t border-zinc-800/80 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Recent
            </p>
            <ul className="space-y-2">
              {library.slice(0, 3).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openLibraryRecording(r.id)}
                    className="w-full rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-left text-xs hover:bg-zinc-800/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 font-medium text-zinc-300 truncate">{r.title}</div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${uploadStatusClass(r.uploadStatus)}`}
                      >
                        {uploadStatusLabel(r.uploadStatus)}
                      </span>
                    </div>
                    <div className="text-zinc-600">
                      {formatTime(r.durationMs)} · {r.mode}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {state.error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{state.error}</p>
        )}
      </main>
    </div>
  );
}
