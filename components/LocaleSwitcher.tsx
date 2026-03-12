'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation, locales, localeNames, stripLocale, localePath } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

const localeFlags: Record<Locale, string> = {
  fr: 'FR',
  en: 'EN',
  nl: 'NL',
  it: 'IT',
  es: 'ES',
};

function useLocaleSwitch() {
  const { locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(newLocale: Locale) {
    if (newLocale === locale) return;
    const stripped = stripLocale(pathname);
    const newPath = localePath(stripped, newLocale);
    document.cookie = `locale=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    router.push(newPath);
  }

  return { locale, handleChange };
}

/**
 * Language selector component for the settings page.
 * Full-width buttons side by side.
 */
export default function LocaleSwitcher() {
  const { locale, handleChange } = useLocaleSwitch();

  return (
    <div className="flex gap-2">
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => handleChange(loc)}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            loc === locale
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          {localeNames[loc]}
        </button>
      ))}
    </div>
  );
}

/**
 * Compact language switcher for public-facing pages.
 * Renders as a small dropdown showing the current locale code.
 * Positioned by the parent — use absolute/fixed positioning as needed.
 */
export function CompactLocaleSwitcher() {
  const { locale, handleChange } = useLocaleSwitch();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-white/80 border border-gray-200 bg-white/60 backdrop-blur-sm transition-all"
        aria-label="Change language"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {localeFlags[locale]}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50 min-w-[140px]">
          {locales.map((loc) => (
            <button
              key={loc}
              onClick={() => { handleChange(loc); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                loc === locale
                  ? 'bg-gray-50 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="mr-2 font-semibold">{localeFlags[loc]}</span>
              {localeNames[loc]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
