const BLOCKED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
];

function tabUrl(tab: chrome.tabs.Tab): string | undefined {
  return tab.url ?? tab.pendingUrl;
}

export function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (BLOCKED_PREFIXES.some((p) => url.startsWith(p))) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function getCaptureBlockReason(url: string | undefined): string | null {
  if (!url) return 'Page is still loading. Wait for it to finish, then try again.';
  if (url.startsWith('chrome://')) {
    return 'Chrome internal pages (chrome://) cannot be recorded. Open a regular website first.';
  }
  if (url.startsWith('chrome-extension://')) {
    return 'Extension pages cannot be recorded. Open a regular website first.';
  }
  if (!isCapturableUrl(url)) {
    return 'This page type cannot be recorded. Open a regular website (https://).';
  }
  return null;
}

export async function waitForTabReady(
  tabId: number,
  timeoutMs = 8000,
): Promise<chrome.tabs.Tab> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    const url = tabUrl(tab);
    const blockReason = getCaptureBlockReason(url);

    if (!blockReason && url) return { ...tab, url };

    if (url && blockReason && !url.startsWith('http')) {
      throw new Error(blockReason);
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  throw new Error('Page is still loading. Wait for it to finish, then try again.');
}

export async function resolveRecordingTab(preferredTabId?: number): Promise<chrome.tabs.Tab> {
  const candidates: number[] = [];

  if (preferredTabId != null) candidates.push(preferredTabId);

  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const focused = windows.find((w) => w.focused) ?? windows[0];
  const activeInFocused = focused?.tabs?.find((t) => t.active)?.id;
  if (activeInFocused != null && !candidates.includes(activeInFocused)) {
    candidates.push(activeInFocused);
  }

  const [fallback] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (fallback?.id != null && !candidates.includes(fallback.id)) {
    candidates.push(fallback.id);
  }

  let lastError = 'No recordable tab found. Open a website (https://) and try again.';

  for (const tabId of candidates) {
    try {
      return await waitForTabReady(tabId, 2000);
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }

  throw new Error(lastError);
}

export async function focusRecordingTab(tabId: number): Promise<chrome.tabs.Tab> {
  const tab = await waitForTabReady(tabId);
  if (tab.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  await chrome.tabs.update(tabId, { active: true });
  return tab;
}

export async function acquireTabStreamId(tabId: number): Promise<string> {
  const tab = await focusRecordingTab(tabId);

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id! });
    if (!streamId) throw new Error('Tab capture failed');
    return streamId;
  } catch (err) {
    const lastError = chrome.runtime.lastError?.message;
    const msg = lastError ?? (err instanceof Error ? err.message : String(err));

    if (msg.toLowerCase().includes("doesn't have url") || msg.toLowerCase().includes('url field')) {
      throw new Error('Page is still loading. Wait for it to finish, then try again.');
    }
    if (msg.toLowerCase().includes('chrome pages')) {
      throw new Error('Chrome internal pages cannot be recorded. Open a regular website (https://).');
    }
    if (msg.toLowerCase().includes('invoked') || msg.toLowerCase().includes('activetab')) {
      throw new Error(
        'Click the Reel icon on the page you want to record, then click Record.',
      );
    }
    throw new Error(msg);
  }
}

/** Chrome's picker needs a normal https tab as anchor — not chrome:// or the side panel. */
export async function findPickerAnchorTab(preferredTabId?: number): Promise<chrome.tabs.Tab> {
  if (preferredTabId != null) {
    try {
      return await waitForTabReady(preferredTabId, 1500);
    } catch {
      // fall through
    }
  }

  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id != null) {
    try {
      return await waitForTabReady(active.id, 1500);
    } catch {
      // fall through
    }
  }

  const httpsTabs = await chrome.tabs.query({
    currentWindow: true,
    url: ['http://*/*', 'https://*/*'],
  });
  const first = httpsTabs.find((t) => t.id != null && isCapturableUrl(tabUrl(t)));
  if (first?.id != null) {
    return chrome.tabs.get(first.id);
  }

  throw new Error(
    'Open a regular website (https://) in this window, then click Record again.',
  );
}

function mapDesktopCaptureError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('tab capture') || lower.includes('starting tab')) {
    return 'Could not open the share dialog. Open a normal website tab (https://), click the Reel icon on that page, then Record again.';
  }
  if (lower.includes("doesn't have url") || lower.includes('url field')) {
    return 'Page is still loading. Wait for it to finish, then try again.';
  }
  return message;
}

export async function chooseDesktopStreamId(
  preferredTabId: number,
  sources: ('screen' | 'window' | 'tab')[],
): Promise<string> {
  const tab = await findPickerAnchorTab(preferredTabId);

  return new Promise((resolve, reject) => {
    chrome.desktopCapture.chooseDesktopMedia(sources, tab, (streamId) => {
      const lastError = chrome.runtime.lastError?.message;
      if (lastError) {
        reject(new Error(mapDesktopCaptureError(lastError)));
        return;
      }
      if (!streamId) reject(new Error('Screen capture cancelled'));
      else resolve(streamId);
    });
  });
}

export async function getTargetTabInfo(): Promise<{ title: string; url: string; capturable: boolean; reason: string | null }> {
  try {
    const tab = await resolveRecordingTab();
    const url = tabUrl(tab) ?? '';
    const reason = getCaptureBlockReason(url);
    return {
      title: tab.title ?? 'Untitled',
      url,
      capturable: reason == null,
      reason,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No active tab';
    return { title: 'No tab', url: '', capturable: false, reason: message };
  }
}
