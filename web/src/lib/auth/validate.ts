const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required.';
  if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(password: string, mode: 'signin' | 'signup'): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  return null;
}

export function validateConfirmPassword(
  password: string,
  confirmPassword: string,
): string | null {
  if (!confirmPassword) return 'Confirm your password.';
  if (password !== confirmPassword) return 'Passwords do not match.';
  return null;
}

export type LoginFieldErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export function validateLoginForm(
  mode: 'signin' | 'signup',
  email: string,
  password: string,
  confirmPassword: string,
): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const emailErr = validateEmail(email);
  if (emailErr) errors.email = emailErr;
  const passwordErr = validatePassword(password, mode);
  if (passwordErr) errors.password = passwordErr;
  if (mode === 'signup') {
    const confirmErr = validateConfirmPassword(password, confirmPassword);
    if (confirmErr) errors.confirmPassword = confirmErr;
  }
  return errors;
}
