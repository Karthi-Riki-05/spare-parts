import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

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
  } catch (err) {
    // Network error, allow request to continue (client-side will handle)
    return NextResponse.next();
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
