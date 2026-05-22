const IFRAME_ROOT_ID = 'reel-webcam-iframe-root';

function removeExtensionIframe(): void {
  document.getElementById(IFRAME_ROOT_ID)?.remove();
}

function makeDraggable(root: HTMLElement): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originRight = 24;
  let originBottom = 96;

  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    const dx = startX - e.clientX;
    const dy = e.clientY - startY;
    root.style.right = `${Math.max(8, originRight + dx)}px`;
    root.style.bottom = `${Math.max(8, originBottom + dy)}px`;
  };

  const onUp = () => {
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const right = parseInt(root.style.right, 10);
    const bottom = parseInt(root.style.bottom, 10);
    if (!Number.isNaN(right)) originRight = right;
    if (!Number.isNaN(bottom)) originBottom = bottom;
  };

  root.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    originRight = parseInt(root.style.right, 10) || 24;
    originBottom = parseInt(root.style.bottom, 10) || 96;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}

function injectExtensionIframe(): void {
  if (document.getElementById(IFRAME_ROOT_ID)) return;

  const root = document.createElement('div');
  root.id = IFRAME_ROOT_ID;
  root.style.cssText =
    'position:fixed;bottom:96px;right:24px;z-index:2147483645;width:160px;height:160px;border-radius:50%;overflow:hidden;border:3px solid #6366f1;box-shadow:0 8px 24px rgba(0,0,0,0.35);pointer-events:auto;cursor:grab;';

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('/webcam-bubble.html');
  iframe.allow = 'camera; microphone';
  iframe.style.cssText = 'width:100%;height:100%;border:none;pointer-events:none;';
  root.appendChild(iframe);
  document.documentElement.appendChild(root);
  makeDraggable(root);
}

export function isWebcamBubbleActive(): boolean {
  return Boolean(document.getElementById(IFRAME_ROOT_ID));
}

/** In-page bubble (extension iframe). Camera + PiP run inside the extension page. */
export function startGlobalWebcamBubble(): void {
  removeExtensionIframe();
  injectExtensionIframe();
}

export function relocateExtensionIframe(): void {
  removeExtensionIframe();
  injectExtensionIframe();
}

export function removeIframeBubbleOnly(): void {
  removeExtensionIframe();
}

export function stopGlobalWebcamBubble(): void {
  removeExtensionIframe();
}
