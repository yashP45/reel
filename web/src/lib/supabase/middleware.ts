import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function safeRedirectPath(path: string | null): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  if (path.startsWith('/login')) return null;
  return path;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    if (searchParams.get('ext') === '1') {
      url.pathname = '/auth/extension-callback';
      url.search = '';
    } else {
      const redirect = safeRedirectPath(searchParams.get('redirect'));
      url.pathname = redirect ?? '/dashboard';
      url.search = '';
    }
    return NextResponse.redirect(url);
  }

  if (!user && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (!user && pathname === '/auth/extension-callback') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('ext', '1');
    return NextResponse.redirect(url);
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = user ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
