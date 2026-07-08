/**
 * Calcul du taux d'occupation d'un employé (stats employés, Phase C).
 *
 * Occupation = minutes réservées / minutes disponibles sur une période.
 * Minutes disponibles = somme, pour chaque jour de la période, des horaires de
 * travail (staff_availability) du jour de semaine correspondant, hors jours de
 * congé (staff_time_off). Fonctions pures → testables sans base.
 */

export interface Availability {
  day_of_week: number;   // 0 = dimanche … 6 = samedi
  start_time: string;    // 'HH:MM' ou 'HH:MM:SS'
  end_time: string;
  is_working: boolean;
}

/** Minutes entre deux heures 'HH:MM[:SS]'. Négatif/incohérent → 0. */
export function minutesBetween(start: string, end: string): number {
  const toMin = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, b - a);
}

/**
 * Minutes de travail disponibles entre deux dates (incluses), en UTC.
 * `sinceISO`/`untilISO` au format 'YYYY-MM-DD'. `timeOffDates` = dates de congé.
 */
export function availableMinutes(
  availabilities: Availability[],
  timeOffDates: Set<string>,
  sinceISO: string,
  untilISO: string,
): number {
  const byDow = new Map<number, Availability>();
  for (const a of availabilities) {
    if (a.is_working) byDow.set(a.day_of_week, a);
  }
  if (byDow.size === 0) return 0;

  let total = 0;
  const cur = new Date(`${sinceISO}T00:00:00Z`);
  const until = new Date(`${untilISO}T00:00:00Z`);
  // Garde-fou : jamais plus d'un an d'itération.
  let guard = 0;
  while (cur.getTime() <= until.getTime() && guard < 366) {
    const dateStr = cur.toISOString().slice(0, 10);
    if (!timeOffDates.has(dateStr)) {
      const avail = byDow.get(cur.getUTCDay());
      if (avail) total += minutesBetween(avail.start_time, avail.end_time);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return total;
}

/**
 * Taux d'occupation en % (0–100, plafonné). 0 min disponibles → 0
 * (évite la division par zéro et un 100 % trompeur).
 */
export function occupancyRate(bookedMinutes: number, availableMin: number): number {
  if (availableMin <= 0) return 0;
  return Math.min(100, Math.round((bookedMinutes / availableMin) * 100));
}
