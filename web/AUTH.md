# Reel web — Email & password auth

No Google OAuth or magic links. Sign in with email + password only (no email sent on each login).

## Supabase setup

1. **Authentication → Providers → Email**
   - Enable **Email**
   - Enable **Email + password** (confirm signups with password is on by default)

2. **For local dev (recommended):**
   - Turn **off** “Confirm email” so new sign-ups can sign in immediately without a confirmation email
   - If “Confirm email” stays **on**, new users must click the link in their inbox before sign-in works (otherwise you see “Invalid login credentials”)

3. **Authentication → URL configuration**
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** add `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback?ext=1` (required when confirm email is on)

## Sign-in flow

1. User enters email + password on `/login`
2. `signInWithPassword` — session is created in the browser (no email sent)
3. Redirect to `/dashboard` or `/auth/extension-callback` when `?ext=1`

**Sign up:** Use “Need an account? Sign up” on the login page.

## Extension

**Production:** set `NEXT_PUBLIC_EXTENSION_ID` in `.env.local` to your fixed Chrome extension ID (Web Store or manifest `key`).

**Reviewers / unpacked install:** leave `NEXT_PUBLIC_EXTENSION_ID` empty (or omit on Vercel). After sign-in with `?ext=1`, `/auth/extension-callback` shows a form to paste the ID from `chrome://extensions` → Reel → Details. It is saved in `localStorage` for that browser.

After password sign-in with `?ext=1`, the app redirects to `/auth/extension-callback` to pass the session to the extension.
