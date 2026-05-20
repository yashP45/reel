import { useCallback, useEffect, useState } from 'react';
import { Toggle } from '../../components/Toggle';
import type { AppState, Message } from '../../lib/messaging';
import { sendMessage } from '../../lib/messaging';
import { base64ToBlob, getLibrary } from '../../lib/storage';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { RecordMode, StoredRecording } from '../../lib/types';

const MODES: { id: RecordMode; label: string; desc: string }[] = [
  { id: 'tab', label: 'This tab', desc: 'Fastest — includes on-page controls' },
  { id: 'window', label: 'Window', desc: 'Pick a window from the browser picker' },
  { id: 'screen', label: 'Full screen', desc: 'Entire display' },
];

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function App() {
  const [state, setState] = useState<AppState>({ phase: 'idle' });
  const [mode, setMode] = useState<RecordMode>('tab');
  const [mic, setMic] = useState(true);
  const [webcam, setWebcam] = useState(false);
  const [library, setLibrary] = useState<StoredRecording[]>([]);
  const [copied, setCopied] = useState(false);

  const refreshLibrary = useCallback(async () => {
    setLibrary(await getLibrary());
  }, []);

  useEffect(() => {
    sendMessage({ type: 'GET_STATE' });
    refreshLibrary();

    const listener = (message: Message) => {
      if (message.type === 'STATE_UPDATE') setState(message.state);
      if (message.type === 'UPLOAD_PROGRESS' && message.progress.status === 'done') {
        refreshLibrary();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refreshLibrary]);

  const startRecording = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

      if (mode === 'tab') {
      await sendMessage({
        type: 'START_RECORDING',
        options: {
          mode,
          mic,
          webcam,
          tabId: tab.id,
          tabTitle: tab.title ?? 'Recording',
          countdownSec: 3,
        },
      });
    } else {
      await sendMessage({
        type: 'START_RECORDING',
        options: {
          mode,
          mic,
          webcam: false,
          tabId: tab.id,
          tabTitle: tab.title ?? 'Recording',
          countdownSec: 0,
        },
      });
    }
  };

  const previewUrl =
    state.currentRecording?.dataBase64 && state.currentRecording.mimeType
      ? URL.createObjectURL(
          base64ToBlob(state.currentRecording.dataBase64, state.currentRecording.mimeType),
        )
      : null;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const copyLink = async () => {
    const url = state.currentRecording?.shareUrl ?? state.uploadProgress?.shareUrl;
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    if (!previewUrl || !state.currentRecording) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `${state.currentRecording.title.replace(/\s+/g, '-')}.webm`;
    a.click();
  };

  const reset = () => {
    sendMessage({ type: 'CANCEL_RECORDING' });
    setState({ phase: 'idle' });
  };

  const phase = state.phase;
  const recording = state.currentRecording;
  const shareUrl = recording?.shareUrl ?? state.uploadProgress?.shareUrl;
  const uploading = phase === 'uploading' || recording?.uploadStatus === 'uploading';
  const uploadPercent = state.uploadProgress?.percent ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800/80 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-lg font-bold text-white">
            R
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Reel</h1>
            <p className="text-xs text-zinc-500">Record & share in seconds</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-5">
        {phase === 'idle' && (
          <>
            <section className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Capture
              </p>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    mode === m.id
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-700/80 bg-zinc-900/40 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-sm font-semibold text-zinc-100">{m.label}</div>
                  <div className="text-xs text-zinc-500">{m.desc}</div>
                </button>
              ))}
            </section>

            <section className="space-y-2">
              <Toggle label="Microphone" icon="🎤" checked={mic} onChange={setMic} />
              {mode === 'tab' && (
                <Toggle label="Webcam bubble" icon="📷" checked={webcam} onChange={setWebcam} />
              )}
            </section>

            <button
              type="button"
              onClick={startRecording}
              className="mt-auto w-full rounded-xl bg-indigo-500 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
            >
              {mode === 'tab' ? 'Record this tab' : `Record ${mode}`}
            </button>
            <p className="text-center text-xs text-zinc-600">
              Shortcut: <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">Alt+Shift+R</kbd>
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
            <p className="max-w-[220px] text-center text-sm text-zinc-500">
              Use the floating bar on the page, or controls below.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  sendMessage({ type: state.paused ? 'RESUME_RECORDING' : 'PAUSE_RECORDING' })
                }
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800"
              >
                {state.paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={() => sendMessage({ type: 'STOP_RECORDING' })}
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
            <p className="text-sm text-zinc-400">Processing video…</p>
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
                Add Supabase env vars to enable share links. Download still works.
              </p>
            )}
            {state.uploadProgress?.status === 'error' && (
              <p className="text-xs text-red-400">{state.uploadProgress.error}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={copyLink}
                disabled={!shareUrl}
                className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-indigo-400"
              >
                {copied ? 'Copied!' : 'Copy share link'}
              </button>
              <button
                type="button"
                onClick={download}
                className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-medium hover:bg-zinc-800"
              >
                Download .webm
              </button>
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
                <li
                  key={r.id}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-xs"
                >
                  <div className="font-medium text-zinc-300 truncate">{r.title}</div>
                  <div className="text-zinc-600">{formatTime(r.durationMs)} · {r.mode}</div>
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
