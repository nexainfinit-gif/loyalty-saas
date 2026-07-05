import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/* ── Config ───────────────────────────────────────────────────────────────── */

const locales = ['fr', 'en', 'nl', 'it', 'es'] as const;
type Locale = (typeof locales)[number];
const defaultLocale: Locale = 'fr';

/** Paths that should NEVER be locale-prefixed or intercepted. */
const IGNORED_PREFIXES = [
  '/api/',
  '/_next/',
  '/favicon',
  '/wallet/',
  '/manifest',
  '/sentry',
];

/** Auth-protected paths (checked AFTER locale prefix is stripped). */
const PROTECTED_PATHS = [
  '/dashboard',
  '/admin',
];

/** Public exceptions inside protected prefixes. */
const PUBLIC_PATHS = [
  '/dashboard/login',
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function getPathnameLocale(pathname: string): Locale | null {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] as Locale;
  return locales.includes(first) ? first : null;
}

function stripLocalePrefix(pathname: string, locale: Locale): string {
  return pathname.replace(new RegExp(`^/${locale}(/|$)`), '/');
}

function getPreferredLocale(request: NextRequest): Locale {
  // 1. Check cookie
  const cookie = request.cookies.get('locale')?.value as Locale | undefined;
  if (cookie && locales.includes(cookie)) return cookie;

  // 2. Check Accept-Language header
  const acceptLang = request.headers.get('accept-language') ?? '';
  if (acceptLang.toLowerCase().startsWith('nl')) return 'nl';
  if (acceptLang.toLowerCase().startsWith('en')) return 'en';
  if (acceptLang.toLowerCase().startsWith('it')) return 'it';
  if (acceptLang.toLowerCase().startsWith('es')) return 'es';

  return defaultLocale;
}

/* ── Proxy ─────────────────────────────────────────────────────────────────── */

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip ignored prefixes (API routes, static assets, etc.)
  if (IGNORED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Skip static files (by extension)
  if (/\.\w{2,4}$/.test(pathname)) {
    return NextResponse.next();
  }

  /* ── Locale routing ──────────────────────────────────────────────────── */

  const pathnameLocale = getPathnameLocale(pathname);

  if (!pathnameLocale) {
    // No locale prefix → redirect to /{locale}/...
    const locale = getPreferredLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }

  // Store locale in cookie for future visits
  let response = NextResponse.next({ request });
  response.cookies.set('locale', pathnameLocale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  });

  /* ── Auth protection for dashboard/admin routes ──────────────────────── */
  // Server-side session gate (defence-in-depth: pages also check client-side,
  // and every API route enforces its own auth). Role checks (platform owner
  // for /admin) remain in the API layer — this gate only requires a session.

  const strippedPath = stripLocalePrefix(pathname, pathnameLocale);
  const isPublic = PUBLIC_PATHS.some((p) => strippedPath.startsWith(p));
  const needsAuth = !isPublic && PROTECTED_PATHS.some((p) => strippedPath.startsWith(p));

  if (needsAuth) {
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

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL(`/${pathnameLocale}/dashboard/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  /* ── Security response headers ─────────────────────────────────────── */

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=()');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     *  - api routes
     *  - _next (static/image)
     *  - favicon.ico
     *  - static files with extensions
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
