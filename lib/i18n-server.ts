/**
 * Server-side i18n utilities.
 * Use this in server components, generateMetadata, and generateStaticParams.
 * The client-side equivalent lives in lib/i18n.tsx.
 */

export type Locale = 'fr' | 'en' | 'nl' | 'it' | 'es';
export const defaultLocale: Locale = 'fr';
export const locales: Locale[] = ['fr', 'en', 'nl', 'it', 'es'];

type Dictionary = Record<string, unknown>;

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  fr: () => import('@/locales/fr.json').then((m) => m.default),
  en: () => import('@/locales/en.json').then((m) => m.default),
  nl: () => import('@/locales/nl.json').then((m) => m.default),
  it: () => import('@/locales/it.json').then((m) => m.default),
  es: () => import('@/locales/es.json').then((m) => m.default),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const loader = dictionaries[locale] ?? dictionaries[defaultLocale];
  return loader();
}

/** Resolve a dotted key from a dictionary object. */
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

/** Server-side translator — async because it loads the dictionary. */
export async function getTranslator(locale: Locale) {
  const dictionary = await getDictionary(locale);

  return function t(key: string, vars?: Record<string, string | number>): string {
    let value = getNestedValue(dictionary, key);
    if (value === undefined) return key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        value = value!.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return value;
  };
}
