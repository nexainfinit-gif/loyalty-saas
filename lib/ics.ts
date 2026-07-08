/**
 * Génération de fichiers iCalendar (.ics) pour « Ajouter au calendrier ».
 *
 * Pourquoi : le lien calendar.google.com/render ouvre l'éditeur DESKTOP de
 * Google Agenda — illisible sur iPhone. Un .ics servi en text/calendar ouvre
 * la feuille native iOS (« Ajouter à Calendrier ») et l'agenda par défaut
 * sur Android/desktop. Heure locale flottante (pas de TZID) : le RDV est au
 * salon, dans le fuseau du client.
 */

/** Échappe le texte pour un champ iCalendar (RFC 5545). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export interface IcsEvent {
  title: string;
  description?: string;
  location?: string;
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

/** Contenu .ics complet (VCALENDAR + VEVENT), lignes CRLF. */
export function buildIcs(event: IcsEvent): string {
  const dt = (time: string) => `${event.date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = `${dt(event.startTime)}-${Math.random().toString(36).slice(2, 10)}@rebites.be`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rebites//Booking//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dt(event.startTime)}`,
    `DTEND:${dt(event.endTime)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
