import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_URL = 'http://backend:3001';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and public routes
  if (pathname === '/login' || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Check auth by verifying token on server-side
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      credentials: 'include',
      headers: {
        Cookie: request.headers.get('cookie') || '',
      },
    });

    if (res.status === 401) {
      // Not authenticated, redirect to login
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!res.ok) {
      // Other auth errors, redirect to login
      return NextResponse.redirect(new URL('/login', request.url));
    }
  } catch (err) {
    // Network error or other issues, redirect to login for security
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
