import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Override Vercel's default Permissions-Policy that blocks camera access.
  // Required for the QR scanner page which uses getUserMedia().
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=()'
  );

  return response;
}

export const config = {
  // Apply to all pages except static files and API routes
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
