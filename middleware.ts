import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function buildSupabase(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  const isDriverPath = pathname.startsWith('/driver');
  const isDashboardPath = pathname.startsWith('/dashboard');

  if (!isDriverPath && !isDashboardPath) {
    return response;
  }

  const supabase = buildSupabase(request, response);
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    if (isDriverPath && pathname !== '/driver/login') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/driver/login';
      return NextResponse.redirect(redirectUrl);
    }

    if (isDashboardPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/driver/login';
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  const role = profile?.role;
  const canDriver = role === 'driver' || role === 'admin';
  const canDashboard = role === 'admin' || role === 'manager';

  if (isDriverPath) {
    if (pathname === '/driver/login') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = canDriver ? '/driver' : '/dashboard';
      return NextResponse.redirect(redirectUrl);
    }

    if (!canDriver) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  }

  if (isDashboardPath && !canDashboard) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/driver';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/driver/:path*', '/dashboard/:path*'],
};
