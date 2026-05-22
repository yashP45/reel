import type { Message } from './messaging';

export async function sendToOffscreen(message: Message): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (response && typeof response === 'object' && 'ok' in response) {
      return response as { ok: boolean; error?: string };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Recorder did not respond',
    };
  }
}
