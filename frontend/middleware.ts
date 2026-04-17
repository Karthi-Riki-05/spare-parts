import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_URL = 'http://backend:3001';

// Public paths — never gated.
const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/confirm-email',
  '/api/',
  '/super-admin/login',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Super admin portal — auth via /api/super-admin/me
  if (pathname.startsWith('/super-admin')) {
    try {
      const res = await fetch(`${API_URL}/api/super-admin/me`, {
        credentials: 'include',
        headers: { Cookie: request.headers.get('cookie') || '' },
      });
      if (res.ok) return NextResponse.next();
    } catch {}
    return NextResponse.redirect(new URL('/super-admin/login', request.url));
  }

  // Company app — auth via /api/auth/me
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      credentials: 'include',
      headers: { Cookie: request.headers.get('cookie') || '' },
    });
    if (res.ok) return NextResponse.next();
  } catch {}
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
