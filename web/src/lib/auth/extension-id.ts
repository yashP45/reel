const STORAGE_KEY = 'reel_extension_id';

/** Chrome extension IDs are 32 chars (a–p). */
export function isValidExtensionId(id: string): boolean {
  return /^[a-p]{32}$/.test(id.trim());
}

export function getStoredExtensionId(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isValidExtensionId(stored)) return stored.trim();
  return null;
}

export function setStoredExtensionId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id.trim());
}

/** Env wins in production; localStorage for reviewers with unpacked extensions. */
export function resolveExtensionId(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_EXTENSION_ID?.trim();
  if (fromEnv && isValidExtensionId(fromEnv)) return fromEnv;
  return getStoredExtensionId();
}
