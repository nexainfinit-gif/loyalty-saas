import { describe, it, expect } from 'vitest';
import { buildIcs, escapeIcsText } from '@/lib/ics';

describe('escapeIcsText', () => {
  it('échappe les caractères spéciaux RFC 5545', () => {
    expect(escapeIcsText('a;b,c\\d')).toBe('a\\;b\\,c\\\\d');
    expect(escapeIcsText('ligne1\nligne2')).toBe('ligne1\\nligne2');
  });
});

describe('buildIcs', () => {
  const ev = {
    title: 'Coupe Femme — Élégance Coiffure',
    description: 'Service : Coupe\nAvec : Sophie',
    location: 'Élégance Coiffure',
    date: '2026-07-09',
    startTime: '14:30',
    endTime: '15:15',
  };

  it('structure VCALENDAR/VEVENT avec CRLF', () => {
    const ics = buildIcs(ev);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('BEGIN:VEVENT\r\n');
    expect(ics).toContain('END:VEVENT\r\nEND:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20260709T143000');
    expect(ics).toContain('DTEND:20260709T151500');
    expect(ics).toContain('SUMMARY:Coupe Femme — Élégance Coiffure');
    expect(ics).toContain('LOCATION:Élégance Coiffure');
    expect(ics).toContain('DESCRIPTION:Service : Coupe\\nAvec : Sophie');
    expect(ics).toMatch(/UID:.*@rebites\.be/);
  });

  it('omet description/location absents', () => {
    const ics = buildIcs({ title: 'X', date: '2026-07-09', startTime: '10:00', endTime: '10:30' });
    expect(ics).not.toContain('DESCRIPTION:');
    expect(ics).not.toContain('LOCATION:');
  });

  it('échappe le titre (injection de champs impossible)', () => {
    const ics = buildIcs({ ...ev, title: 'Hack\r\nX-EVIL:1' });
    expect(ics).not.toContain('\r\nX-EVIL');
    expect(ics).toContain('SUMMARY:Hack\\nX-EVIL:1');
  });
});
