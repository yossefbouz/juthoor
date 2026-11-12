import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const pathname = request.nextUrl.pathname;

  // Routes that don't require authentication. Everything else under
  // `(app-pages)` (dashboard, tree, families, villages, search, ...) is
  // gated. Keeping the allowlist here keeps middleware in sync with the
  // server-side AuthGuard so visitors never see a flash of protected UI.
  const publicExact = new Set(['/']);
  const publicPrefixes = [
    '/about',
    '/why',
    '/how',
    '/contact',
    '/faq',
    '/privacy',
    '/terms',
    '/login',
    '/sign-up',
    '/forgot-password',
    '/update-password',
    '/auth',
  ];
  const isPublic =
    publicExact.has(pathname) ||
    publicPrefixes.some(
      (p) => pathname === p || pathname.startsWith(p + '/'),
    );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Closed accounts: profile.deleted_at set (or Auth already removed).
  // Block re-entry if a stale session somehow remains.
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('deleted_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.deleted_at) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('closed', '1');
      const redirect = NextResponse.redirect(url);
      // Copy refreshed auth cookies from supabaseResponse onto the redirect
      // so the browser actually drops the closed session.
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirect.cookies.set(cookie);
      });
      return redirect;
    }
  }

  // Already authenticated visitors hitting /login or /sign-up should bounce
  // straight to the dashboard. Forgot-password is left alone so logged-in
  // users can still reset.
  if (user && (pathname === '/login' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get('next');
    url.pathname = next && next.startsWith('/') ? next : '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
