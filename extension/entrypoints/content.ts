import type { Message } from '../lib/messaging';

const OVERLAY_ID = 'reel-overlay-root';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createOverlay(webcam: boolean): HTMLElement {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  root.innerHTML = `
    <style>
      #${OVERLAY_ID} {
        all: initial;
        font-family: system-ui, -apple-system, sans-serif;
      }
      #${OVERLAY_ID} * { box-sizing: border-box; }
      #reel-controls {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        background: rgba(15, 15, 20, 0.92);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        backdrop-filter: blur(12px);
        color: #fff;
        font-size: 14px;
      }
      #reel-timer { font-variant-numeric: tabular-nums; min-width: 48px; font-weight: 600; }
      #reel-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #ef4444;
        animation: reel-pulse 1.2s ease-in-out infinite;
      }
      @keyframes reel-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .reel-btn {
        border: none;
        cursor: pointer;
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        transition: background 0.15s;
      }
      #reel-pause { background: rgba(255,255,255,0.12); color: #fff; }
      #reel-pause:hover { background: rgba(255,255,255,0.2); }
      #reel-stop { background: #ef4444; color: #fff; }
      #reel-stop:hover { background: #dc2626; }
      #reel-webcam {
        position: fixed;
        bottom: 96px;
        right: 24px;
        z-index: 2147483645;
        width: 160px;
        height: 160px;
        border-radius: 50%;
        overflow: hidden;
        border: 3px solid #6366f1;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        background: #111;
        display: none;
      }
      #reel-webcam video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform: scaleX(-1);
      }
      #reel-countdown {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.5);
        font-size: 120px;
        font-weight: 800;
        color: #fff;
        pointer-events: none;
      }
    </style>
    <div id="reel-countdown"></div>
    <div id="reel-webcam"><video autoplay muted playsinline></video></div>
    <div id="reel-controls">
      <div id="reel-dot"></div>
      <span id="reel-timer">0:00</span>
      <button class="reel-btn" id="reel-pause">Pause</button>
      <button class="reel-btn" id="reel-stop">Stop</button>
    </div>
  `;

  document.documentElement.appendChild(root);

  if (webcam) {
    const webcamEl = root.querySelector('#reel-webcam') as HTMLElement;
    webcamEl.style.display = 'block';
    const video = root.querySelector('#reel-webcam video') as HTMLVideoElement;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 320, facingMode: 'user' }, audio: false })
      .then((stream) => {
        video.srcObject = stream;
      })
      .catch(() => {
        webcamEl.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:32px;color:#71717a;">📷</div>';
      });
  }

  root.querySelector('#reel-pause')?.addEventListener('click', () => {
    const btn = root.querySelector('#reel-pause') as HTMLButtonElement;
    const paused = btn.textContent === 'Resume';
    btn.textContent = paused ? 'Pause' : 'Resume';
    chrome.runtime.sendMessage({ type: paused ? 'RESUME_RECORDING' : 'PAUSE_RECORDING' } as Message);
  });

  root.querySelector('#reel-stop')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' } as Message);
  });

  return root;
}

function removeOverlay(): void {
  const root = document.getElementById(OVERLAY_ID);
  if (!root) return;
  const video = root.querySelector('#reel-webcam video') as HTMLVideoElement | null;
  const stream = video?.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  root.remove();
}

function showCountdown(n: number): void {
  const el = document.querySelector('#reel-countdown') as HTMLElement | null;
  if (!el) return;
  if (n <= 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  el.textContent = String(n);
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
      if (message.type === 'CONTENT_PING') {
        sendResponse('pong');
        return true;
      }

      switch (message.type) {
        case 'OVERLAY_SHOW':
          createOverlay(message.options.webcam);
          break;
        case 'OVERLAY_HIDE':
          removeOverlay();
          break;
        case 'OVERLAY_TICK': {
          const timer = document.querySelector('#reel-timer');
          if (timer) timer.textContent = formatTime(message.elapsedMs);
          break;
        }
        case 'OVERLAY_PAUSED': {
          const dot = document.querySelector('#reel-dot') as HTMLElement | null;
          if (dot) dot.style.background = message.paused ? '#f59e0b' : '#ef4444';
          break;
        }
        case 'COUNTDOWN_TICK':
          showCountdown(message.remaining);
          if (message.remaining <= 0) showCountdown(0);
          break;
      }
      return undefined;
    });
  },
});
