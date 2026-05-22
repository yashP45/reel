import type { Message } from './messaging';

const CONTENT_SCRIPT_PATH = '/content-scripts/content.js';

export async function ensureContentScript(tabId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_PING' });
      if (response === 'pong') return true;
    } catch {
      // Only inject once per tab load — avoid duplicate listeners / extra getUserMedia
      if (attempt === 0) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: [CONTENT_SCRIPT_PATH],
          });
        } catch {
          return false;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

export async function sendToTab(tabId: number, message: Message): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    const ready = await ensureContentScript(tabId);
    if (!ready) return false;
    try {
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch {
      return false;
    }
  }
}
