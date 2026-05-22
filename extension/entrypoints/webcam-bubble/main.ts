import type { Message } from '../../lib/messaging';

const video = document.getElementById('cam') as HTMLVideoElement;
const placeholder = document.getElementById('placeholder') as HTMLDivElement;

function showFailure(): void {
  video.style.display = 'none';
  placeholder.style.display = 'flex';
  chrome.runtime.sendMessage({ type: 'WEBCAM_UNAVAILABLE' } satisfies Message).catch(() => {});
}

async function stopCamera(): Promise<void> {
  if (document.pictureInPictureElement === video) {
    await document.exitPictureInPicture().catch(() => {});
  }
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

async function startCamera(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 320, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    if (document.pictureInPictureEnabled) {
      try {
        await video.requestPictureInPicture();
        await chrome.runtime.sendMessage({ type: 'WEBCAM_MODE', mode: 'pip' } satisfies Message);
        await chrome.runtime.sendMessage({ type: 'WEBCAM_READY' } satisfies Message);
        return;
      } catch {
        await document.exitPictureInPicture().catch(() => {});
      }
    }

    await chrome.runtime.sendMessage({ type: 'WEBCAM_MODE', mode: 'iframe' } satisfies Message);
    await chrome.runtime.sendMessage({ type: 'WEBCAM_READY' } satisfies Message);
  } catch {
    showFailure();
  }
}

void startCamera();

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'WEBCAM_STOP') {
    void stopCamera();
  }
});
