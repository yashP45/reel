/** Extension-origin bubble — camera permission is granted once per extension, not per site. */
const video = document.getElementById('cam') as HTMLVideoElement;

void navigator.mediaDevices
  .getUserMedia({ video: { width: 320, height: 320, facingMode: 'user' }, audio: false })
  .then((stream) => {
    video.srcObject = stream;
  })
  .catch(() => {
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:28px;color:#71717a;">📷</div>';
    chrome.runtime.sendMessage({ type: 'WEBCAM_UNAVAILABLE' }).catch(() => {});
  });

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'WEBCAM_STOP') {
    const stream = video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
  }
});
