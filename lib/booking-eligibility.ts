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
