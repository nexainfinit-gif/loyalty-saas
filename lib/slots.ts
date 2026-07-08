/**
 * Calcul pur des créneaux de réservation — source unique partagée par la page
 * de réservation publique ET par le flux Reserve with Google (feeds +
 * CheckAvailability). Aucune I/O : l'appelant fournit les données.
 */

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function laterTime(a: string, b: string): string {
  return timeToMinutes(a) >= timeToMinutes(b) ? a : b;
}

export function earlierTime(a: string, b: string): string {
  return timeToMinutes(a) <= timeToMinutes(b) ? a : b;
}

export interface SlotInput {
  /** Durée du service (minutes). */
  serviceDuration: number;
  /** Pas entre deux débuts de créneau (minutes). */
  slotStep: number;
  /** Marge après chaque RDV existant (minutes). */
  bufferMinutes: number;
  /** Ouverture effective 'HH:MM' (max ouverture établissement / début employé). */
  openTime: string;
  /** Fermeture effective 'HH:MM' (min fermeture établissement / fin employé). */
  closeTime: string;
  /** RDV existants du jour (bloquants). */
  existing: { start_time: string; end_time: string }[];
  /** Minutes depuis minuit en-dessous desquelles un créneau est passé (0 si autre jour). */
  nowMinutes?: number;
}

/**
 * Génère la grille de créneaux d'une journée avec leur disponibilité.
 * Un créneau est indisponible s'il chevauche un RDV existant (+ buffer).
 */
export function computeSlots(input: SlotInput): { time: string; available: boolean }[] {
  const { serviceDuration, slotStep, bufferMinutes, openTime, closeTime, existing } = input;
  const nowMinutes = input.nowMinutes ?? 0;

  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const slots: { time: string; available: boolean }[] = [];

  if (slotStep <= 0 || serviceDuration <= 0) return slots;

  for (let m = openMinutes; m + serviceDuration <= closeMinutes; m += slotStep) {
    if (m < nowMinutes) continue; // pas de créneau passé
    const slotStart = m;
    const slotEnd = m + serviceDuration;
    const hasConflict = existing.some((appt) => {
      const apptStart = timeToMinutes(appt.start_time);
      const apptEnd = timeToMinutes(appt.end_time) + bufferMinutes;
      return slotStart < apptEnd && slotEnd > apptStart;
    });
    slots.push({ time: minutesToTime(m), available: !hasConflict });
  }
  return slots;
}
