const AUTH_KEY = 'reel_auth_session';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email?: string;
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const result = await chrome.storage.local.get(AUTH_KEY);
  const session = result[AUTH_KEY] as AuthSession | undefined;
  if (!session?.access_token || !session?.user_id) return null;
  return session;
}

export async function setAuthSession(session: AuthSession): Promise<void> {
  await chrome.storage.local.set({ [AUTH_KEY]: session });
}

export async function clearAuthSession(): Promise<void> {
  await chrome.storage.local.remove(AUTH_KEY);
}
