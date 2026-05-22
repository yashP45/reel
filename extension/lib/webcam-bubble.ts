import type { Message } from './messaging';

const PIP_ROOT_ID = 'reel-pip-host';
const IFRAME_ROOT_ID = 'reel-webcam-iframe-root';

let pipStream: MediaStream | null = null;
let pipVideo: HTMLVideoElement | null = null;
let usingExtensionIframe = false;

function removeExtensionIframe(): void {
  document.getElementById(IFRAME_ROOT_ID)?.remove();
  usingExtensionIframe = false;
}

function injectExtensionIframe(): void {
  if (document.getElementById(IFRAME_ROOT_ID)) return;
  usingExtensionIframe = true;

  const root = document.createElement('div');
  root.id = IFRAME_ROOT_ID;
  root.style.cssText =
    'position:fixed;bottom:96px;right:24px;z-index:2147483645;width:160px;height:160px;border-radius:50%;overflow:hidden;border:3px solid #6366f1;box-shadow:0 8px 24px rgba(0,0,0,0.35);pointer-events:none;';

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('/webcam-bubble.html');
  iframe.allow = 'camera';
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  root.appendChild(iframe);
  document.documentElement.appendChild(root);
}

async function startPictureInPicture(): Promise<boolean> {
  if (pipStream?.active) {
    try {
      if (document.pictureInPictureElement !== pipVideo) {
        await pipVideo?.requestPictureInPicture();
      }
      return true;
    } catch {
      return false;
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 320, facingMode: 'user' },
    audio: false,
  });

  pipStream = stream;

  let host = document.getElementById(PIP_ROOT_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = PIP_ROOT_ID;
    host.style.cssText =
      'position:fixed;width:160px;height:160px;right:0;bottom:0;opacity:0;pointer-events:none;overflow:hidden;';
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);';
    host.appendChild(video);
    document.documentElement.appendChild(host);
    pipVideo = video;
  } else {
    pipVideo = host.querySelector('video') as HTMLVideoElement;
  }

  pipVideo!.srcObject = stream;
  await pipVideo!.play();

  if (!document.pictureInPictureEnabled) return false;

  try {
    await pipVideo!.requestPictureInPicture();
    return true;
  } catch {
    return false;
  }
}

export function isWebcamBubbleActive(): boolean {
  return Boolean(
    pipStream?.active ||
      document.pictureInPictureElement ||
      document.getElementById(IFRAME_ROOT_ID),
  );
}

export async function startGlobalWebcamBubble(): Promise<void> {
  if (document.pictureInPictureElement && pipStream?.active) return;

  removeExtensionIframe();

  try {
    const pipOk = await startPictureInPicture();
    if (pipOk) return;
  } catch {
    // fall through to extension iframe
  }

  injectExtensionIframe();
}

/** Move extension iframe to the active tab when PiP is unavailable. */
export function relocateExtensionIframe(): void {
  if (document.pictureInPictureElement && pipStream?.active) return;
  removeExtensionIframe();
  injectExtensionIframe();
}

export function removeIframeBubbleOnly(): void {
  removeExtensionIframe();
}

export function stopGlobalWebcamBubble(): void {
  if (document.pictureInPictureElement === pipVideo) {
    void document.exitPictureInPicture().catch(() => {});
  }

  pipStream?.getTracks().forEach((t) => t.stop());
  pipStream = null;
  pipVideo = null;
  document.getElementById(PIP_ROOT_ID)?.remove();
  removeExtensionIframe();

  if (usingExtensionIframe) {
    chrome.runtime.sendMessage({ type: 'WEBCAM_STOP' } satisfies Message).catch(() => {});
  }
}
