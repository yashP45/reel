/** Tracks whether camera was acquired this recording session (background-owned). */
let webcamActive = false;

export function isWebcamSessionActive(): boolean {
  return webcamActive;
}

export function setWebcamSessionActive(active: boolean): void {
  webcamActive = active;
}
