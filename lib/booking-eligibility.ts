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
