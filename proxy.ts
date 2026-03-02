import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js middleware — runs on the Edge before the route handler.
 *
 * Responsibilities:
 *   1. Refresh Supabase session cookies so they stay alive.
 *   2. Redirect unauthenticated visitors away from Wallet Studio UI paths.
 *
 * Platform-role enforcement (owner vs. restaurant_admin) is handled
 * server-side inside the API route handlers via lib/server-auth.ts.
 * The middleware only checks "is the user logged in at all?".
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — keeps auth cookies alive on every protected-route request.
  const { data: { user } } = await supabase.auth.getUser();

  // Wallet Studio UI requires authentication.
  // Role check (owner-only) happens inside the API routes.
  if (!user) {
    return NextResponse.redirect(new URL('/dashboard/login', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/wallet/:path*',
    '/dashboard/wallet-preview/:path*',
    '/dashboard/wallet-studio/:path*',
  ],
};
