import { type NextRequest } from 'next/server';
import { updateSession } from './supabase-clients/middleware';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // api routes are not handled by middleware for this project.
  if (pathname.startsWith('/api/') || pathname === '/api') {
    return null;
  }
  if (pathname) return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon
     * - PWA shell: sw.js, manifest, offline.html, icons
     * - static image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

