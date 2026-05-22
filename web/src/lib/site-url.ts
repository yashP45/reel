/** Public site origin for auth redirects (emails must match Supabase Redirect URLs). */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

export function authCallbackUrl(forExtension: boolean): string {
  const base = `${getSiteUrl()}/auth/callback`;
  return forExtension ? `${base}?ext=1` : base;
}
