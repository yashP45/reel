import { createClient } from '@/lib/supabase/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function completeSignIn(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const forExtension = searchParams.get('ext') === '1';

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Invalid or expired sign-in link')}`,
    );
  }

  if (forExtension) {
    return NextResponse.redirect(`${origin}/auth/extension-callback`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
