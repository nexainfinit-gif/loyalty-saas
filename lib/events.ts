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

/** Présentation d'un billet sur le pass Apple Wallet — mappe l'état métier
 *  (statut billet + statut événement + date) vers ce que le pass affiche.
 *  Pur et testé : le rendu (strip, champs, voided) découle d'UNE source.
 *  `refunded`/`transferred` sont déjà mappés pour le jour où le schéma les
 *  portera — inconnus = traités comme invalides (pass void, badge neutre). */
export interface TicketPresentation {
  /** Badge cuit dans le strip — null : aucun (billet valide, le silence est le statut). */
  badge: 'UTILISÉ' | 'ANNULÉ' | 'EXPIRÉ' | 'REMBOURSÉ' | 'TRANSFÉRÉ' | null;
  /** Badge neutre (gris) plutôt qu'alerte (rouge). */
  badgeMuted: boolean;
  /** Valeur du champ natif STATUT (VoiceOver + vues système). */
  statusLabel: string;
  /** pass.json voided — iOS grise le pass et le QR. */
  voided: boolean;
}

export function eventTicketPresentation(opts: {
  ticketStatus: string;
  eventStatus?: string | null;
  startsAt: string | Date;
  now?: Date;
}): TicketPresentation {
  const { ticketStatus, eventStatus, startsAt } = opts;
  const now = opts.now ?? new Date();

  // L'annulation de l'événement prime sur tout : plus aucun billet n'admet.
  if (eventStatus === 'cancelled') {
    return { badge: 'ANNULÉ', badgeMuted: false, statusLabel: 'Événement annulé', voided: true };
  }
  if (ticketStatus === 'checked_in') {
    return { badge: 'UTILISÉ', badgeMuted: false, statusLabel: 'Déjà utilisé', voided: true };
  }
  if (ticketStatus === 'cancelled' || ticketStatus === 'refunded') {
    return { badge: 'REMBOURSÉ', badgeMuted: false, statusLabel: 'Remboursé', voided: true };
  }
  if (ticketStatus === 'transferred') {
    return { badge: 'TRANSFÉRÉ', badgeMuted: true, statusLabel: 'Transféré', voided: true };
  }
  if (ticketStatus !== 'valid') {
    // Statut inconnu : ne jamais présenter un billet admissible par défaut.
    return { badge: null, badgeMuted: true, statusLabel: 'Non valide', voided: true };
  }
  // Valide mais événement passé (> J+1) : rendu neutre, pass archivé par
  // expirationDate de toute façon — cohérent si le porteur re-télécharge.
  const expired = now.getTime() > new Date(startsAt).getTime() + 24 * 3600 * 1000;
  if (expired) {
    return { badge: 'EXPIRÉ', badgeMuted: true, statusLabel: 'Expiré', voided: false };
  }
  return { badge: null, badgeMuted: false, statusLabel: 'Valide', voided: false };
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
