'use client';

import Link from 'next/link';
import { useTranslation, localePath } from '@/lib/i18n';
import type { ComponentProps } from 'react';

type LocaleLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
};

/**
 * A locale-aware Link component.
 * Automatically prefixes the href with the current locale.
 *
 * Usage: <LocaleLink href="/dashboard">Dashboard</LocaleLink>
 * Result: <Link href="/fr/dashboard">Dashboard</Link>  (if locale is 'fr')
 *
 * prefetch désactivé par défaut (BUG-17 : 15-20+ requêtes RSC par page
 * causées par le prefetch de toute la nav). Surchargeable : passer
 * prefetch={true} sur un lien critique si besoin.
 */
export default function LocaleLink({ href, ...props }: LocaleLinkProps) {
  const { locale } = useTranslation();
  const localizedHref = href.startsWith('/') ? localePath(href, locale) : href;

  return <Link prefetch={false} href={localizedHref} {...props} />;
}
