import { describe, it, expect, vi } from 'vitest';
import frDict from '../../locales/fr.json';
import enDict from '../../locales/en.json';

// We test the pure utility functions and locale files directly,
// without going through getDictionary (which uses require('@/locales/...'))
// The React hooks (useTranslation, useLocaleRouter) need a React context and
// are tested via the proxy/routing tests below.

import {
  localePath,
  extractLocale,
  stripLocale,
  defaultLocale,
  locales,
  localeNames,
} from '@/lib/i18n';

/* ── Helper: nested key resolver (mirrors lib/i18n.tsx) ──────────────── */

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

function translate(dict: Record<string, unknown>, key: string, vars?: Record<string, string | number>): string {
  let value = getNestedValue(dict, key);
  if (value === undefined) return key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      value = value!.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }
  return value;
}

/* ── Helper: flatten keys ────────────────────────────────────────────── */

function flatKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  if (typeof obj !== 'object' || obj === null) return keys;
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${k}` : k;
    const val = (obj as Record<string, unknown>)[k];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      keys.push(...flatKeys(val, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  1. FR / EN DISPLAY                                                  */
/* ══════════════════════════════════════════════════════════════════════ */

describe('FR/EN translation display', () => {
  const tFr = (key: string, vars?: Record<string, string | number>) => translate(frDict, key, vars);
  const tEn = (key: string, vars?: Record<string, string | number>) => translate(enDict, key, vars);

  it('resolves a simple key in French', () => {
    expect(tFr('common.save')).toBe('Enregistrer');
  });

  it('resolves a simple key in English', () => {
    expect(tEn('common.save')).toBe('Save');
  });

  it('resolves nested keys (nav.overview)', () => {
    const frVal = tFr('nav.overview');
    expect(frVal).not.toBe('nav.overview');
    expect(frVal.length).toBeGreaterThan(0);
  });

  it('returns key itself for missing translations', () => {
    expect(tFr('nonexistent.missing.key')).toBe('nonexistent.missing.key');
    expect(tEn('nonexistent.missing.key')).toBe('nonexistent.missing.key');
  });

  it('supports variable interpolation ({slug})', () => {
    const result = tFr('settings.slugHint', { slug: 'mon-restaurant' });
    expect(result).toContain('mon-restaurant');
    expect(result).not.toContain('{slug}');
  });

  it('supports variable interpolation in English', () => {
    const result = tEn('settings.planLabel', { plan: 'PRO' });
    expect(result).toContain('PRO');
    expect(result).not.toContain('{plan}');
  });

  it('FR and EN values differ for key UI strings', () => {
    const pairs = [
      'common.save', 'common.cancel', 'common.delete',
      'nav.overview', 'nav.clients', 'settings.title', 'billing.title',
    ];
    for (const key of pairs) {
      expect(tFr(key), `"${key}" should differ FR vs EN`).not.toBe(tEn(key));
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  2. TRANSLATION COVERAGE & PARITY                                    */
/* ══════════════════════════════════════════════════════════════════════ */

describe('translation coverage', () => {
  const frKeys = flatKeys(frDict);
  const enKeysSet = new Set(flatKeys(enDict));

  it('French has at least 1000 keys', () => {
    expect(frKeys.length).toBeGreaterThanOrEqual(1000);
  });

  it('English has at least 1000 keys', () => {
    expect(enKeysSet.size).toBeGreaterThanOrEqual(1000);
  });

  it('every FR key exists in EN (full parity)', () => {
    const missing = frKeys.filter(k => !enKeysSet.has(k));
    expect(missing).toEqual([]);
  });

  it('all expected namespaces exist in both FR and EN', () => {
    const expected = [
      'common', 'nav', 'dashboard', 'clients', 'campaigns',
      'settings', 'loyalty', 'analytics', 'overview', 'mobile',
      'tutorial', 'register', 'support', 'privacy', 'onboarding',
      'plan', 'billing', 'scanner', 'auth', 'appointments',
      'booking', 'bookingSuccess', 'wallet', 'walletPreview',
    ];
    for (const ns of expected) {
      expect((frDict as any)[ns], `"${ns}" missing in FR`).toBeDefined();
      expect((enDict as any)[ns], `"${ns}" missing in EN`).toBeDefined();
    }
  });

  it('no empty string values in FR', () => {
    const empties = flatKeys(frDict).filter(k => {
      const v = getNestedValue(frDict, k);
      return v !== undefined && v.trim() === '';
    });
    expect(empties).toEqual([]);
  });

  it('no empty string values in EN', () => {
    const empties = flatKeys(enDict).filter(k => {
      const v = getNestedValue(enDict, k);
      return v !== undefined && v.trim() === '';
    });
    expect(empties).toEqual([]);
  });

  it('variable keys in FR also have translations in EN', () => {
    const varKeys = flatKeys(frDict).filter(k => {
      const v = getNestedValue(frDict, k);
      return v !== undefined && v.includes('{') && v.includes('}');
    });
    expect(varKeys.length).toBeGreaterThan(0);
    for (const key of varKeys) {
      const enVal = getNestedValue(enDict, key);
      expect(enVal, `EN missing variable key: ${key}`).toBeDefined();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  3. ROUTE REDIRECTION (URL helpers)                                  */
/* ══════════════════════════════════════════════════════════════════════ */

describe('localePath — locale prefix routing', () => {
  it('/dashboard → /fr/dashboard', () => {
    expect(localePath('/dashboard', 'fr')).toBe('/fr/dashboard');
  });

  it('/dashboard → /en/dashboard', () => {
    expect(localePath('/dashboard', 'en')).toBe('/en/dashboard');
  });

  it('handles paths without leading slash', () => {
    expect(localePath('dashboard', 'fr')).toBe('/fr/dashboard');
  });

  it('handles root path', () => {
    expect(localePath('/', 'fr')).toBe('/fr/');
    expect(localePath('/', 'en')).toBe('/en/');
  });

  it('handles nested paths', () => {
    expect(localePath('/dashboard/settings', 'en')).toBe('/en/dashboard/settings');
    expect(localePath('/register/my-shop', 'fr')).toBe('/fr/register/my-shop');
    expect(localePath('/book/my-salon/success', 'en')).toBe('/en/book/my-salon/success');
  });
});

describe('extractLocale', () => {
  it('extracts fr from /fr/dashboard', () => {
    expect(extractLocale('/fr/dashboard')).toBe('fr');
  });

  it('extracts en from /en/dashboard', () => {
    expect(extractLocale('/en/dashboard')).toBe('en');
  });

  it('returns default locale for unknown prefix', () => {
    expect(extractLocale('/de/dashboard')).toBe(defaultLocale);
  });

  it('returns default locale for root path', () => {
    expect(extractLocale('/')).toBe(defaultLocale);
  });

  it('extracts locale from deeply nested paths', () => {
    expect(extractLocale('/en/dashboard/appointments/settings')).toBe('en');
    expect(extractLocale('/fr/admin/plans/123')).toBe('fr');
  });
});

describe('stripLocale', () => {
  it('strips fr prefix', () => {
    expect(stripLocale('/fr/dashboard')).toBe('/dashboard');
  });

  it('strips en prefix', () => {
    expect(stripLocale('/en/dashboard/settings')).toBe('/dashboard/settings');
  });

  it('returns path unchanged if no locale prefix', () => {
    expect(stripLocale('/dashboard')).toBe('/dashboard');
  });

  it('handles root with locale', () => {
    expect(stripLocale('/fr')).toBe('/');
    expect(stripLocale('/en')).toBe('/');
  });
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  4. LANGUAGE SWITCHING                                               */
/* ══════════════════════════════════════════════════════════════════════ */

describe('language switching simulation', () => {
  it('switching locale changes the path prefix correctly', () => {
    const currentPath = '/fr/dashboard/settings';
    const stripped = stripLocale(currentPath);
    expect(stripped).toBe('/dashboard/settings');

    const newPath = localePath(stripped, 'en');
    expect(newPath).toBe('/en/dashboard/settings');
  });

  it('switching from EN to FR preserves the page', () => {
    const currentPath = '/en/register/my-shop';
    const stripped = stripLocale(currentPath);
    const newPath = localePath(stripped, 'fr');
    expect(newPath).toBe('/fr/register/my-shop');
  });

  it('switching locale on root path works', () => {
    const currentPath = '/fr/';
    const stripped = stripLocale(currentPath);
    const newPath = localePath(stripped, 'en');
    expect(newPath).toBe('/en/');
  });

  it('round-trip: same page in both locales shows different content', () => {
    const tFr = (key: string) => translate(frDict, key);
    const tEn = (key: string) => translate(enDict, key);

    // Simulate rendering the same page in both locales
    expect(tFr('settings.title')).not.toBe(tEn('settings.title'));
    expect(tFr('nav.overview')).not.toBe(tEn('nav.overview'));
    expect(tFr('common.save')).not.toBe(tEn('common.save'));
  });
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  5. PERSISTENCE (cookie-based, tested via config)                    */
/* ══════════════════════════════════════════════════════════════════════ */

describe('locale persistence configuration', () => {
  it('default locale is fr', () => {
    expect(defaultLocale).toBe('fr');
  });

  it('supported locales are exactly [fr, en, nl, it, es]', () => {
    expect(locales).toEqual(['fr', 'en', 'nl', 'it', 'es']);
    expect(locales).toHaveLength(5);
  });

  it('locale names are correctly defined', () => {
    expect(localeNames.fr).toBe('Français');
    expect(localeNames.en).toBe('English');
    expect(localeNames.nl).toBe('Nederlands');
    expect(localeNames.it).toBe('Italiano');
    expect(localeNames.es).toBe('Español');
  });

  it('extractLocale + localePath are inverse operations', () => {
    const path = '/dashboard/billing';
    for (const loc of locales) {
      const prefixed = localePath(path, loc);
      const extracted = extractLocale(prefixed);
      expect(extracted).toBe(loc);
    }
  });

  it('stripLocale + localePath are inverse operations', () => {
    for (const loc of locales) {
      const original = `/${loc}/dashboard/settings`;
      const stripped = stripLocale(original);
      const rebuilt = localePath(stripped, loc);
      expect(rebuilt).toBe(original);
    }
  });
});
