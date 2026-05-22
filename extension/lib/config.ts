export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const SHARE_PAGE_URL = import.meta.env.VITE_SHARE_PAGE_URL as string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      !SUPABASE_URL.includes('your-project') &&
      !SUPABASE_ANON_KEY.includes('your-anon-key'),
  );
}

export function getSharePageUrl(): string {
  return SHARE_PAGE_URL ?? '';
}
