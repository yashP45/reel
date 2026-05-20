import type { StoredRecording } from './types';

const LIBRARY_KEY = 'reel_library';
const MAX_LIBRARY = 5;

export async function getLibrary(): Promise<StoredRecording[]> {
  const { [LIBRARY_KEY]: library } = await chrome.storage.local.get(LIBRARY_KEY);
  return (library as StoredRecording[]) ?? [];
}

export async function saveRecording(recording: StoredRecording): Promise<void> {
  const library = await getLibrary();
  const next = [recording, ...library.filter((r) => r.id !== recording.id)].slice(
    0,
    MAX_LIBRARY,
  );
  await chrome.storage.local.set({ [LIBRARY_KEY]: next });
}

export async function updateRecording(
  id: string,
  patch: Partial<StoredRecording>,
): Promise<StoredRecording | undefined> {
  const library = await getLibrary();
  const idx = library.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  const updated = { ...library[idx], ...patch };
  library[idx] = updated;
  await chrome.storage.local.set({ [LIBRARY_KEY]: library });
  return updated;
}

export async function getRecording(id: string): Promise<StoredRecording | undefined> {
  const library = await getLibrary();
  return library.find((r) => r.id === id);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
