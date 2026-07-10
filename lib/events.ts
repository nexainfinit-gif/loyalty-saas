import crypto from 'crypto';

/** Billetterie — helpers purs (testés unitairement). */

/** Alphabet sans caractères ambigus (0/O, 1/I/L) — même famille que les bons. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Code billet lisible type « EV-K7NM-P3XW ». */
export function generateTicketCode(): string {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  const block = () => pick() + pick() + pick() + pick();
  return `EV-${block()}-${block()}`;
}

export const TICKET_MIN_QTY = 1;
export const TICKET_MAX_QTY = 6;
export const EVENT_MAX_PRICE_EUR = 500;

/** Commission plateforme sur billets PAYANTS : 1,5 % + 0,25 € par billet.
 *  Rien sur les billets gratuits. Prélevée via application_fee_amount
 *  (Stripe Connect) — premier flux commissionné de la plateforme. */
export function platformFeeCents(ticketPriceCents: number, quantity: number): number {
  if (ticketPriceCents <= 0) return 0;
  const perTicket = Math.round(ticketPriceCents * 0.015) + 25;
  return perTicket * quantity;
}

/** Valide un prix d'événement (en €) et le retourne en centimes, sinon null.
 *  0 = événement gratuit (accepté). */
export function validateEventPriceCents(priceEur: unknown): number | null {
  const n = Number(priceEur);
  if (!Number.isFinite(n) || n < 0) return null;
  const cents = Math.round(n * 100);
  if (cents > EVENT_MAX_PRICE_EUR * 100) return null;
  return cents;
}

/** Valide une quantité de billets par achat. */
export function validateQuantity(qty: unknown): number | null {
  const n = Number(qty);
  if (!Number.isInteger(n) || n < TICKET_MIN_QTY || n > TICKET_MAX_QTY) return null;
  return n;
}

/** Slug d'événement depuis son titre (même règle que l'onboarding). */
export function eventSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
