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
 * Page d'accueil d'un membre d'équipe : l'agenda pour les établissements avec
 * réservation (salons…), le scanner fidélité pour les autres (cafés, restos…).
 *
 * On se base sur le TYPE d'activité (comme le dashboard qui gate l'agenda via
 * BOOKING_ELIGIBLE_TYPES). ⚠️ NE PAS utiliser `products` : il contient
 * 'booking' pour TOUS les commerces par défaut à l'onboarding → signal faux.
 */
export function staffLanding(
  businessType: string | null | undefined,
): 'appointments' | 'scanner' {
  return isBookingEligible(businessType) ? 'appointments' : 'scanner';
}
