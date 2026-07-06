'use client';

import { createContext, useContext, ReactNode, useMemo, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

import fr from '@/locales/fr.json';
import en from '@/locales/en.json';
import nl from '@/locales/nl.json';
import it from '@/locales/it.json';
import es from '@/locales/es.json';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type Locale = 'fr' | 'en' | 'nl' | 'it' | 'es';
export const defaultLocale: Locale = 'fr';
export const locales: Locale[] = ['fr', 'en', 'nl', 'it', 'es'];

export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  nl: 'Nederlands',
  it: 'Italiano',
  es: 'Español',
};

/* ── Dictionary loader ────────────────────────────────────────────────────── */

// Dictionaries are bundled by Next.js at build time
type Dictionary = Record<string, unknown>;

const dictionaries: Record<Locale, Dictionary> = { fr, en, nl, it, es };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

/* ── Nested key resolver ──────────────────────────────────────────────────── */

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

/* ── Translation function ─────────────────────────────────────────────────── */

/**
 * Create a `t()` function for the given locale.
 * Supports variable interpolation: `t('greeting', { name: 'Ali' })` → "Bonjour Ali"
 * Variables in JSON use `{name}` syntax.
 */
export function createTranslator(locale: Locale) {
  const dictionary = getDictionary(locale);

  return function t(key: string, vars?: Record<string, string | number>): string {
    let value = getNestedValue(dictionary, key);
    if (value === undefined) {
      // Fallback to French, then to the key itself
      if (locale !== 'fr') {
        const fallback = getNestedValue(getDictionary('fr'), key);
        if (fallback !== undefined) value = fallback;
      }
      if (value === undefined) return key;
    }
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        value = value!.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return value;
  };
}

/* ── React Context ────────────────────────────────────────────────────────── */

interface I18nContextValue {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<I18nContextValue>(() => {
    const t = createTranslator(locale);
    return { locale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook to access translations in client components.
 * Returns `{ locale, t }` where `t(key, vars?)` resolves the translation.
 */
export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LocaleProvider');
  }
  return context;
}

/* ── Locale-aware router hook ──────────────────────────────────────────────── */

/**
 * Drop-in replacement for `useRouter()` that auto-prefixes locale to all paths.
 * Usage: `const router = useLocaleRouter(); router.push('/dashboard');`
 * → navigates to `/fr/dashboard` (or `/en/dashboard` depending on current locale)
 */
export function useLocaleRouter() {
  const router = useRouter();
  const { locale } = useTranslation();

  const push = useCallback(
    (path: string) => router.push(path.startsWith('/') ? localePath(path, locale) : path),
    [router, locale],
  );
  const replace = useCallback(
    (path: string) => router.replace(path.startsWith('/') ? localePath(path, locale) : path),
    [router, locale],
  );

  return useMemo(() => ({ ...router, push, replace }), [router, push, replace]);
}

/* ── URL helpers ──────────────────────────────────────────────────────────── */

/** Prefix a path with the current locale: localePath('/dashboard', 'en') → '/en/dashboard'.
 *  Idempotent : si le chemin est DÉJÀ préfixé d'une locale (ex. '/fr/dashboard'),
 *  on ne re-préfixe pas → évite les URLs cassées à double locale '/fr/fr/...'. */
export function localePath(path: string, locale: Locale): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const first = clean.split('/').filter(Boolean)[0];
  if (locales.includes(first as Locale)) return clean;
  return `/${locale}${clean}`;
}

/** Extract locale from a pathname: '/en/dashboard' → 'en' */
export function extractLocale(pathname: string): Locale {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] as Locale;
  return locales.includes(first) ? first : defaultLocale;
}

/** Remove locale prefix from pathname: '/en/dashboard' → '/dashboard' */
export function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] as Locale;
  if (locales.includes(first)) {
    return '/' + segments.slice(1).join('/');
  }
  return pathname;
}
