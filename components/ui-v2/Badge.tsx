import type { ReactNode } from 'react';

type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'neutral' | 'honey';

interface BadgeProps {
  tone?: Tone;
  /** Masque le point coloré de gauche. */
  bare?: boolean;
  className?: string;
  children: ReactNode;
}

/** Pastille d'état du design system v2. */
export function Badge({ tone = 'neutral', bare = false, className = '', children }: BadgeProps) {
  const cls = `v2-badge v2-badge--${tone}${bare ? ' v2-badge--bare' : ''}${className ? ` ${className}` : ''}`;
  return <span className={cls}>{children}</span>;
}
