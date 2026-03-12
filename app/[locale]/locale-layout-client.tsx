'use client';

import { useEffect } from 'react';
import { LocaleProvider } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

function HtmlLangSetter({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

export default function LocaleLayoutClient({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider locale={locale}>
      <HtmlLangSetter locale={locale} />
      {children}
    </LocaleProvider>
  );
}
