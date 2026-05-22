'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

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

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState('Connecting extension…');

  useEffect(() => {
    const connect = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session?.user) {
        setStatus('Not signed in. Close this tab and try Sign in again.');
        return;
      }

      const session = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.session.user.id,
        email: data.session.user.email,
      };

      const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;

      if (!extensionId || !window.chrome?.runtime?.sendMessage) {
        setStatus(
          'Set NEXT_PUBLIC_EXTENSION_ID in web/.env to your extension ID from chrome://extensions, then reload this page.',
        );
        return;
      }

      window.chrome.runtime.sendMessage(
        extensionId,
        { type: 'REEL_AUTH_SESSION', session },
        (response) => {
          if (window.chrome?.runtime?.lastError) {
            setStatus(
              `Could not reach extension: ${window.chrome.runtime.lastError.message}. Reload the extension and try again.`,
            );
            return;
          }
          if (response && typeof response === 'object' && 'ok' in response && (response as { ok: boolean }).ok) {
            setStatus('Extension connected! You can close this tab and record from Reel.');
          } else {
            setStatus('Extension did not confirm. Reload the extension and try again.');
          }
        },
      );
    };

    void connect();
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-xl font-bold">
        R
      </div>
      <p className="text-sm text-zinc-400">{status}</p>
      <a href="/dashboard" className="text-sm text-indigo-400 hover:text-indigo-300">
        Open dashboard
      </a>
    </div>
  );
}
