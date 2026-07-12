import type { CSSProperties } from 'react';

/* Utilitaires d'accent du design system v2 : injecter la couleur d'un
   établissement comme accent (bouton, focus, sélection) sur les neutres chauds. */

/** Assombrit un hex de `pct`% (négatif = plus sombre). */
export function shade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = 1 + pct / 100;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * f);
  const g = clamp(((n >> 8) & 255) * f);
  const b = clamp((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Texte lisible (ink foncé ou blanc) selon la luminance de la couleur. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#1C1B19' : '#FFFFFF';
}

/** Variables CSS à poser sur un conteneur pour teinter le design system v2. */
export function accentVars(color: string): CSSProperties {
  return {
    '--v2-a-600': color,
    '--v2-a-700': shade(color, -14),
    '--v2-a-50': `${color}14`,
    '--v2-a-100': `${color}22`,
    '--v2-a-200': `${color}33`,
    '--v2-ring': `${color}2e`,
    '--v2-btn-bg': color,
    '--v2-btn-bg-h': shade(color, -14),
    '--v2-btn-fg': readableOn(color),
  } as CSSProperties;
}
