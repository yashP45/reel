const OFFSCREEN_URL = 'offscreen.html';

let creating: Promise<void> | null = null;

export async function setupOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  if (existing.length > 0) return;

  if (creating) {
    await creating;
    return;
  }

  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
    justification: 'Record screen, tab, microphone, and webcam for Reel screen recordings',
  });

  await creating;
  creating = null;
}

export async function waitForOffscreenRecorder(timeoutMs = 5000): Promise<void> {
  await setupOffscreenDocument();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'RECORDER_PING' });
      if (response === 'pong') return;
    } catch {
      // offscreen listener not ready yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Video recorder failed to initialize. Reload the extension and try again.');
}

export async function closeOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (existing.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}
