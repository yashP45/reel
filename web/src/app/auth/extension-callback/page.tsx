'use client';

import {
  getStoredExtensionId,
  isValidExtensionId,
  resolveExtensionId,
  setStoredExtensionId,
} from '@/lib/auth/extension-id';
import { createClient } from '@/lib/supabase/client';
import { FormEvent, useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          extensionId: string,
          message: unknown,
          callback?: (response: unknown) => void,
        ) => void;
        lastError?: { message?: string };
      };
    };
  }
}

type AuthSession = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string | undefined;
};

type Phase = 'loading' | 'need-id' | 'connecting' | 'success' | 'error';

export default function ExtensionCallbackPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState('Connecting extension…');
  const [extensionIdInput, setExtensionIdInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const envExtensionId = process.env.NEXT_PUBLIC_EXTENSION_ID?.trim();
  const reviewerMode = !envExtensionId || !isValidExtensionId(envExtensionId);

  const sendToExtension = useCallback(
    (extensionId: string, session: AuthSession) => {
      if (!window.chrome?.runtime?.sendMessage) {
        setPhase('error');
        setStatus('Open this page in Chrome with the Reel extension installed.');
        return;
      }

      setPhase('connecting');
      setStatus('Connecting extension…');

      window.chrome.runtime.sendMessage(
        extensionId,
        { type: 'REEL_AUTH_SESSION', session },
        (response) => {
          if (window.chrome?.runtime?.lastError) {
            if (reviewerMode) {
              setPhase('need-id');
              setStatus('Could not reach the extension. Check the ID below and try again.');
            } else {
              setPhase('error');
              setStatus(
                `Could not reach extension: ${window.chrome.runtime.lastError.message}. Reload the extension and try again.`,
              );
            }
            return;
          }
          if (response && typeof response === 'object' && 'ok' in response && (response as { ok: boolean }).ok) {
            setPhase('success');
            setStatus('Extension connected! You can close this tab and record from Reel.');
          } else if (reviewerMode) {
            setPhase('need-id');
            setStatus('Extension did not confirm. Check the ID and reload the extension.');
          } else {
            setPhase('error');
            setStatus('Extension did not confirm. Reload the extension and try again.');
          }
        },
      );
    },
    [reviewerMode],
  );

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session?.user) {
        setPhase('error');
        setStatus('Not signed in. Close this tab and try Sign in again from the extension.');
        return;
      }

      const session: AuthSession = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.session.user.id,
        email: data.session.user.email,
      };
      setAuthSession(session);

      const id = resolveExtensionId();
      if (id) {
        sendToExtension(id, session);
        return;
      }

      setExtensionIdInput(getStoredExtensionId() ?? '');
      setPhase('need-id');
      setStatus('Enter your Reel extension ID to connect.');
    };

    void init();
  }, [sendToExtension]);

  const handleSubmitId = (e: FormEvent) => {
    e.preventDefault();
    const id = extensionIdInput.trim();
    if (!isValidExtensionId(id)) {
      setInputError('Paste the 32-character ID from chrome://extensions (letters a–p only).');
      return;
    }
    setInputError('');
    setStoredExtensionId(id);
    if (authSession) sendToExtension(id, authSession);
  };

  const showIdForm = phase === 'need-id';

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-xl font-bold">
        R
      </div>

      {(phase === 'connecting' || phase === 'loading') && (
        <p className="text-sm text-zinc-400">{status}</p>
      )}

      {phase === 'success' && <p className="text-sm text-emerald-400">{status}</p>}

      {phase === 'error' && !showIdForm && <p className="text-sm text-red-300">{status}</p>}

      {showIdForm && (
        <div className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-left">
          <p className="mb-1 text-sm font-medium text-zinc-200">Extension ID</p>
          <p className="mb-4 text-xs text-zinc-500">
            {status} Copy it from{' '}
            <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">chrome://extensions</code>{' '}
            → Reel → Details. Saved in this browser after a successful connect.
          </p>
          <form onSubmit={handleSubmitId} className="space-y-3">
            <input
              type="text"
              value={extensionIdInput}
              onChange={(e) => setExtensionIdInput(e.target.value)}
              placeholder="e.g. hbpmlpbdfhinijdmifajpimfkmmlijic"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
            {inputError ? <p className="text-xs text-red-300">{inputError}</p> : null}
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              Connect extension
            </button>
          </form>
        </div>
      )}

      {reviewerMode && phase === 'success' && (
        <p className="text-xs text-zinc-600">Extension ID saved for next sign-in on this browser.</p>
      )}

      {reviewerMode && phase !== 'need-id' && phase !== 'loading' && (
        <button
          type="button"
          onClick={() => {
            setPhase('need-id');
            setExtensionIdInput(getStoredExtensionId() ?? '');
            setStatus('Enter your Reel extension ID to connect.');
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Change extension ID
        </button>
      )}

      <a href="/dashboard" className="text-sm text-indigo-400 hover:text-indigo-300">
        Open dashboard
      </a>
    </div>
  );
}
