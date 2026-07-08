import { NextResponse, NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Exclude public assets, authentication endpoints, and login/register pages
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  // 2. Retrieve auth_token from cookies
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return handleUnauthorized(request);
  }

  // 3. Verify JWT signature and expiration
  const verified = await verifyToken(token);
  if (!verified) {
    // If token is invalid, clear the cookie and redirect/unauthorize
    const response = handleUnauthorized(request);
    response.cookies.delete('auth_token');
    return response;
  }

  return NextResponse.next();
}

function handleUnauthorized(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If requesting an API endpoint, return 401 Unauthorized
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Unauthorized. Please login first.' },
      { status: 401 }
    );
  }

  // If requesting a UI page, redirect to the login page
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

// Limit the middleware to match only pages and API endpoints
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
