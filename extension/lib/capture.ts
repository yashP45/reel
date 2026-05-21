const BLOCKED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
];

export function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (BLOCKED_PREFIXES.some((p) => url.startsWith(p))) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export async function acquireTabStreamId(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (!isCapturableUrl(tab.url)) {
    throw new Error('Cannot record this page. Switch to a regular website (https://).');
  }

  try {
    return await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('tab capture') || msg.toLowerCase().includes('activeTab')) {
      throw new Error(
        'Tab capture failed. Click Record again on the tab you want to capture (not chrome:// pages).',
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}
