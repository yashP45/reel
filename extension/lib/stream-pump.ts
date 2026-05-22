/**
 * Chrome offscreen: raw tab/desktop streams often produce 0-byte or frozen
 * MediaRecorder output. Pump frames through a playing <video> + canvas.
 */

export async function waitForVideo(video: HTMLVideoElement, timeoutMs = 5000): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return;

  await Promise.race([
    new Promise<void>((resolve) => {
      const done = () => {
        if (video.videoWidth > 0) resolve();
      };
      video.onloadeddata = done;
      video.onresize = done;
    }),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Video stream did not start')), timeoutMs),
    ),
  ]);
}

export interface StreamPumpHandle {
  stream: MediaStream;
  stop: () => void;
}

export async function pumpStreamThroughCanvas(
  sourceStream: MediaStream,
  mount: HTMLElement,
  fps = 30,
): Promise<StreamPumpHandle> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = sourceStream;
  mount.appendChild(video);

  await video.play();
  await waitForVideo(video);

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');

  let active = true;
  let rafId: number | null = null;

  const draw = () => {
    if (!active) return;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    rafId = requestAnimationFrame(draw);
  };
  draw();

  const pumped = canvas.captureStream(fps);
  const out = new MediaStream();
  for (const track of pumped.getVideoTracks()) {
    out.addTrack(track);
  }
  for (const track of sourceStream.getAudioTracks()) {
    out.addTrack(track);
  }

  return {
    stream: out,
    stop: () => {
      active = false;
      if (rafId != null) cancelAnimationFrame(rafId);
      video.srcObject = null;
      video.remove();
    },
  };
}
