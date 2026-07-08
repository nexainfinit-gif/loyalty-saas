/**
 * Forfaits prépayés (Phase C — C2). Helpers purs de validation + génération de
 * code. Le code de forfait réutilise le générateur des bons cadeaux (format
 * XXXX-XXXX, sans caractères ambigus).
 */
export { generateVoucherCode as generatePackageCode } from '@/lib/gift-vouchers';

export const PKG_MIN_EUR = 1;
export const PKG_MAX_EUR = 5000;
export const PKG_MIN_SESSIONS = 1;
export const PKG_MAX_SESSIONS = 100;

/** Valide un prix en euros → centimes, ou null hors bornes. */
export function validatePackagePriceCents(eur: unknown): number | null {
  if (typeof eur !== 'number' || !Number.isFinite(eur)) return null;
  if (eur < PKG_MIN_EUR || eur > PKG_MAX_EUR) return null;
  return Math.round(eur * 100);
}

/** Valide un nombre de séances entier dans les bornes, ou null. */
export function validateSessions(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  if (n < PKG_MIN_SESSIONS || n > PKG_MAX_SESSIONS) return null;
  return n;
}

/** Expiration par défaut : +1 an (ISO). */
export function defaultPackageExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}
