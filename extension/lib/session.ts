const SESSION_KEY = 'reel_session_id';

export async function getSessionId(): Promise<string> {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  if (stored[SESSION_KEY]) return stored[SESSION_KEY] as string;

  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [SESSION_KEY]: id });
  return id;
}
