import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_URL = 'http://backend:3001';

// Auth check timeout. 3s is generous for a JWT-verify + single DB lookup.
// If the backend exceeds this, it is either overloaded or down — treat as
// unauthenticated so the page load doesn't hang indefinitely (Issue H1).
const AUTH_TIMEOUT_MS = 3000;

// Public paths — never gated.
const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/confirm-email',
  '/api/',
  '/super-admin/login',
];

async function checkAuth(url: string, cookieHeader: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch (err: unknown) {
    // TimeoutError → backend is slow/down. AbortError → request was cancelled
    // by the runtime before we got here. NetworkError → no connection.
    // All three cases: treat as unauthenticated so the user gets the login
    // page immediately instead of a hanging spinner.
    if (process.env.NODE_ENV !== 'production') {
      const name = err instanceof Error ? err.name : 'UnknownError';
      const msg  = err instanceof Error ? err.message : String(err);
      console.warn(`[middleware] auth check failed (${name}): ${msg} — redirecting to login`);
    }
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookieHeader = request.headers.get('cookie') || '';

  // Super admin portal — auth via /api/super-admin/me
  if (pathname.startsWith('/super-admin')) {
    const ok = await checkAuth(`${API_URL}/api/super-admin/me`, cookieHeader);
    if (ok) return NextResponse.next();
    return NextResponse.redirect(new URL('/super-admin/login', request.url));
  }

  // Company app — auth via /api/auth/me
  const ok = await checkAuth(`${API_URL}/api/auth/me`, cookieHeader);
  if (ok) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
