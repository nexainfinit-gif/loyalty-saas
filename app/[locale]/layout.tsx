import type { Metadata } from 'next';
import { locales, defaultLocale, getDictionary } from '@/lib/i18n-server';
import type { Locale } from '@/lib/i18n-server';
import LocaleLayoutClient from './locale-layout-client';

/* ── Static params for all supported locales ────────────────────────────── */

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/* ── Dynamic metadata per locale ────────────────────────────────────────── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = locales.includes(rawLocale as Locale)
    ? (rawLocale as Locale)
    : defaultLocale;

  const dict = await getDictionary(locale);
  const meta = (dict as Record<string, Record<string, string>>).metadata ?? {};

  return {
    title: meta.title ?? 'ReBites — Loyalty Platform',
    description: meta.description ?? 'Restaurant loyalty program management',
  };
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = locales.includes(rawLocale as Locale)
    ? (rawLocale as Locale)
    : defaultLocale;

  return (
    <LocaleLayoutClient locale={locale}>
      {children}
    </LocaleLayoutClient>
  );
}
