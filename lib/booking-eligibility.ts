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
 * L'établissement utilise-t-il le module réservation ? On se fie d'abord aux
 * produits activés (choix explicite), sinon à l'éligibilité par type d'activité.
 */
export function hasBooking(
  businessType: string | null | undefined,
  products: string[] | null | undefined,
): boolean {
  if (products && products.length) return products.includes('booking');
  return isBookingEligible(businessType);
}

/**
 * Page d'accueil d'un membre d'équipe : l'agenda pour les établissements avec
 * réservation (salons…), le scanner fidélité pour les autres (cafés, restos…).
 */
export function staffLanding(
  businessType: string | null | undefined,
  products: string[] | null | undefined,
): 'appointments' | 'scanner' {
  return hasBooking(businessType, products) ? 'appointments' : 'scanner';
}
