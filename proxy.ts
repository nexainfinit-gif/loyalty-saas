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

/**
 * Auth-protected paths (checked AFTER locale prefix is stripped).
 *
 * ⚠️ NE PAS ajouter /dashboard ni /admin ici tant que l'auth n'est pas migrée
 * en cookies. La session vit en localStorage (lib/supabase.ts, storageKey
 * 'loyalty-auth') et n'est copiée vers les cookies que côté client, en
 * asynchrone, par SupabaseSessionSync. Après login, window.location.href vers
 * /dashboard navigue AVANT que le cookie soit écrit → un gate serveur sur
 * /dashboard renvoie au login en boucle. /dashboard et /admin sont donc
 * gardés côté client (getSession dans les pages). Ne restent gatées côté
 * serveur que les pages wallet, atteintes par navigation in-app (cookie déjà
 * synchronisé à ce moment-là).
 */
const PROTECTED_PATHS = [
  '/dashboard/wallet',
  '/admin/wallet-preview',
  '/dashboard/wallet-studio',
];

/** Public exceptions inside protected prefixes. */
const PUBLIC_PATHS: string[] = [];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function getPathnameLocale(pathname: string): Locale | null {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] as Locale;
  return locales.includes(first) ? first : null;
}

function stripLocalePrefix(pathname: string, locale: Locale): string {
  return pathname.replace(new RegExp(`^/${locale}(/|$)`), '/');
}

/**
 * Bascule design v2 « Comptoir » — mappe un chemin public (locale déjà retirée)
 * vers sa page v2 équivalente, ou null si aucune. UNIQUEMENT les pages publiques
 * validées : le dashboard n'est PAS inclus (pas encore iso-fonctionnel).
 * Servi par REWRITE (URL inchangée) → QR/NFC/emails/billets/embed intacts.
 */
function mapToV2(strippedPath: string): string | null {
  const seg = strippedPath.split('/').filter(Boolean);
  // /register/[slug]
  if (seg.length === 2 && seg[0] === 'register') return `/design-v2/register/${seg[1]}`;
  // /book/[slug] — exclut cancel/reschedule/status ; /book/[slug]/success (3 seg) exclu par la longueur
  if (seg.length === 2 && seg[0] === 'book' && !['cancel', 'reschedule', 'status'].includes(seg[1])) return `/book-v2/${seg[1]}`;
  // /client/[slug]
  if (seg.length === 2 && seg[0] === 'client') return `/client-v2/${seg[1]}`;
  // /event/[slug]/[eventSlug] — exclut /event/ticket/[code]
  if (seg.length === 3 && seg[0] === 'event' && seg[1] !== 'ticket') return `/event-v2/${seg[1]}/${seg[2]}`;
  // /dashboard/login
  if (seg.length === 2 && seg[0] === 'dashboard' && seg[1] === 'login') return `/login-v2`;
  // /onboarding
  if (seg.length === 1 && seg[0] === 'onboarding') return `/onboarding-v2`;
  return null;
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

  /* ── Bascule design v2 « Comptoir » ──────────────────────────────────── */
  // Beta opt-in via cookie `ui_v2` (posé par ?v2=1, retiré par ?v2=0). Flag
  // global `UI_V2_GLOBAL` = seam pour un toggle runtime (à câbler sur un KV
  // Upstash quand on passera en bascule globale sans redeploy).
  const v2Query = request.nextUrl.searchParams.get('v2');
  const v2GlobalOn = process.env.UI_V2_GLOBAL === 'on'; // TODO: lire depuis KV (Upstash) pour un toggle sans redeploy
  const v2OptIn = v2Query === '1' || (request.cookies.get('ui_v2')?.value === '1' && v2Query !== '0');
  const v2Enabled = v2GlobalOn || v2OptIn;

  const setV2Cookie = (res: NextResponse) => {
    if (v2Query === '1') res.cookies.set('ui_v2', '1', { path: '/', maxAge: 60 * 60 * 24 * 180, sameSite: 'lax' });
    else if (v2Query === '0') res.cookies.set('ui_v2', '', { path: '/', maxAge: 0 });
  };

  const v2Target = v2Enabled ? mapToV2(strippedPath) : null;
  if (v2Target) {
    const url = request.nextUrl.clone();
    url.pathname = `/${pathnameLocale}${v2Target}`;
    const rw = NextResponse.rewrite(url);
    rw.cookies.set('locale', pathnameLocale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
    setV2Cookie(rw);
    rw.headers.set('X-Frame-Options', 'DENY');
    rw.headers.set('X-Content-Type-Options', 'nosniff');
    rw.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    rw.headers.set('Permissions-Policy', 'camera=(self), microphone=()');
    return rw;
  }
  // Pas de rewrite mais opt-in/opt-out demandé → poser/retirer le cookie.
  setV2Cookie(response);

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
