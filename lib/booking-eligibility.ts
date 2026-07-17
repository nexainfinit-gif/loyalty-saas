/**
 * Types d'activité éligibles au module réservation.
 * Source unique — importée par le dashboard, la nav mobile et la génération
 * des passes Wallet (lien « Réserver » au dos du pass).
 */
export const BOOKING_ELIGIBLE_TYPES = new Set([
  'salon_coiffure',
  'salon_beaute',
  'barbershop',
  'spa',
  'bien_etre',
]);

export function isBookingEligible(businessType: string | null | undefined): boolean {
  return BOOKING_ELIGIBLE_TYPES.has(businessType ?? '');
}

/**
 * Le module réservation est-il OUVERT au public pour cet établissement ?
 * Depuis l'add-on 055, c'est piloté par `booking_active` (payé, ou salon
 * grand-fathered au backfill) — quel que soit le type d'activité. Remplace
 * l'ancien gate sur `business_type` pour les routes /api/book publiques et le
 * lien « Réserver » des passes Wallet.
 */
export function isBookingOpen(
  restaurant: { booking_active?: boolean | null } | null | undefined,
): boolean {
  return restaurant?.booking_active === true;
}

/**
 * Page d'accueil d'un membre d'équipe : l'agenda s'il a accès au Booking
 * (service actif sur l'établissement ET accès donné à ce membre), sinon le
 * scanner fidélité. Modèle add-on 055 : tout staff = commerce ; booking à la carte.
 */
export function staffLanding(
  bookingActive: boolean | null | undefined,
  bookingAccess: boolean | null | undefined,
): 'appointments' | 'scanner' {
  return bookingActive && bookingAccess ? 'appointments' : 'scanner';
}
