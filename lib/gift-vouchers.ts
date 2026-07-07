import crypto from 'crypto';

/** Bons cadeaux — helpers purs (testés unitairement). */

/** Alphabet sans caractères ambigus (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Code lisible type « K7NM-P3XW » (2×4, ~1 milliard de combinaisons). */
export function generateVoucherCode(): string {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  const block = () => pick() + pick() + pick() + pick();
  return `${block()}-${block()}`;
}

export const GIFT_MIN_EUR = 5;
export const GIFT_MAX_EUR = 500;

/** Valide un montant d'achat et le retourne en centimes, sinon null. */
export function validateGiftAmountCents(amountEur: unknown): number | null {
  const n = Number(amountEur);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  if (cents < GIFT_MIN_EUR * 100 || cents > GIFT_MAX_EUR * 100) return null;
  return cents;
}

/** Validité légale : 1 an par défaut. */
export function defaultExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}
