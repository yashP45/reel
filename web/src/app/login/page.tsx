'use client';

import { PasswordField } from '@/components/PasswordField';
import { validateLoginForm, type LoginFieldErrors } from '@/lib/auth/validate';
import { authCallbackUrl } from '@/lib/site-url';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';

type Mode = 'signin' | 'signup';

function safeRedirectPath(path: string | null): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  if (path.startsWith('/login')) return null;
  return path;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forExtension = searchParams.get('ext') === '1';
  const urlError = searchParams.get('error');
  const redirectTo = safeRedirectPath(searchParams.get('redirect'));

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(urlError ?? '');
  const [isError, setIsError] = useState(Boolean(urlError));
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  const authRedirectTo = () => authCallbackUrl(forExtension);

  const finishSignIn = () => {
    if (forExtension) {
      router.push('/auth/extension-callback');
    } else if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.push('/dashboard');
    }
    router.refresh();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setMessage('');
    setIsError(false);
    setFieldErrors({});
    setAwaitingConfirmation(false);
    setConfirmPassword('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validateLoginForm(mode, email, password, confirmPassword);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsError(true);
      setMessage('Fix the errors below.');
      return;
    }

    const trimmed = email.trim();
    setLoading(true);
    setMessage('');
    setIsError(false);
    setFieldErrors({});

    const supabase = createClient();

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: trimmed,
        password,
        options: { emailRedirectTo: authRedirectTo() },
      });

      if (error) {
        setIsError(true);
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        setAwaitingConfirmation(false);
        finishSignIn();
        return;
      }

      setAwaitingConfirmation(true);
      setIsError(false);
      setMessage('Check your email for a confirmation link, then sign in.');
      setMode('signin');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });

    setLoading(false);

    if (error) {
      setIsError(true);
      const lower = error.message.toLowerCase();
      if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
        setMessage(
          awaitingConfirmation
            ? 'Sign in failed. Confirm your email first (check inbox/spam), or resend confirmation below.'
            : 'Wrong email or password — or your account is not confirmed yet.',
        );
      } else {
        setMessage(error.message);
      }
      return;
    }

    setAwaitingConfirmation(false);
    finishSignIn();
  };

  const resendConfirmation = async () => {
    const emailErr = validateLoginForm('signin', email, password, '').email;
    if (emailErr) {
      setFieldErrors({ email: emailErr });
      setIsError(true);
      setMessage('Enter a valid email address first.');
      return;
    }
    setLoading(true);
    setMessage('');
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: authRedirectTo() },
    });
    setLoading(false);
    if (error) {
      setIsError(true);
      setMessage(error.message);
      return;
    }
    setIsError(false);
    setMessage('Confirmation email sent. Check your inbox and spam folder.');
    setAwaitingConfirmation(true);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-xl font-bold">
          R
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Reel</h1>
          <p className="text-sm text-zinc-500">
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </p>
        </div>
      </div>

      {forExtension && (
        <p className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-center text-sm text-indigo-200">
          Sign in here to connect uploads from the Chrome extension.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            aria-invalid={Boolean(fieldErrors.email)}
            className={`w-full rounded-xl border bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50 ${
              fieldErrors.email
                ? 'border-red-500/60 focus:border-red-500'
                : 'border-zinc-700 focus:border-indigo-500'
            }`}
          />
          {fieldErrors.email && <p className="text-xs text-red-400">{fieldErrors.email}</p>}
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          disabled={loading}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />

        {mode === 'signup' && (
          <PasswordField
            id="confirmPassword"
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            error={fieldErrors.confirmPassword}
            disabled={loading}
            autoComplete="new-password"
          />
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        {message && (
          <p className={`text-center text-sm ${isError ? 'text-red-400' : 'text-zinc-400'}`}>
            {message}
          </p>
        )}

        {(awaitingConfirmation || (isError && message.toLowerCase().includes('confirm'))) && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void resendConfirmation()}
            className="text-center text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            Resend confirmation email
          </button>
        )}
      </form>

      <button
        type="button"
        onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
        className="text-sm text-indigo-400 hover:text-indigo-300"
      >
        {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
