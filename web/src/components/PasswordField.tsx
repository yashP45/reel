'use client';

import { useState } from 'react';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  placeholder?: string;
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  placeholder = '••••••••',
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          minLength={6}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={`w-full rounded-xl border bg-zinc-900/60 py-3 pl-4 pr-11 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50 ${
            error
              ? 'border-red-500/60 focus:border-red-500'
              : 'border-zinc-700 focus:border-indigo-500'
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
        >
          {visible ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 3l18 18M10.5 10.7a2.5 2.5 0 003.5 3.5M7.2 7.4C5.5 8.7 4.2 10.4 3 12c2.2 3.5 5.8 6 9 6 1.4 0 2.7-.4 3.9-1M14 5.2c.9-.2 1.8-.2 2.7 0 3.2.5 6.1 2.4 8.3 5.8-1 1.5-2.3 2.8-3.7 3.8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
