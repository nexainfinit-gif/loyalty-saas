import { describe, it, expect } from 'vitest';
import { computeSlots, timeToMinutes, minutesToTime, laterTime, earlierTime } from '@/lib/slots';

describe('helpers heure', () => {
  it('conversions', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
    expect(laterTime('09:00', '10:00')).toBe('10:00');
    expect(earlierTime('18:00', '19:00')).toBe('18:00');
  });
});

describe('computeSlots', () => {
  const base = { serviceDuration: 30, slotStep: 30, bufferMinutes: 0, openTime: '09:00', closeTime: '11:00', existing: [] };

  it('grille de créneaux vide → tous disponibles', () => {
    const s = computeSlots(base);
    expect(s.map(x => x.time)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(s.every(x => x.available)).toBe(true);
  });

  it('marque indisponibles les créneaux en conflit', () => {
    const s = computeSlots({ ...base, existing: [{ start_time: '09:30', end_time: '10:00' }] });
    expect(s.find(x => x.time === '09:30')!.available).toBe(false);
    expect(s.find(x => x.time === '09:00')!.available).toBe(true);
    expect(s.find(x => x.time === '10:00')!.available).toBe(true);
  });

  it('le buffer étend le blocage', () => {
    const s = computeSlots({ ...base, bufferMinutes: 15, existing: [{ start_time: '09:30', end_time: '10:00' }] });
    // 10:00 chevauche 10:00+buffer(15) → bloqué
    expect(s.find(x => x.time === '10:00')!.available).toBe(false);
  });

  it('exclut les créneaux passés (nowMinutes)', () => {
    const s = computeSlots({ ...base, nowMinutes: timeToMinutes('10:00') });
    expect(s.map(x => x.time)).toEqual(['10:00', '10:30']);
  });

  it('respecte la durée du service (ne dépasse pas la fermeture)', () => {
    const s = computeSlots({ ...base, serviceDuration: 60, closeTime: '10:30' });
    expect(s.map(x => x.time)).toEqual(['09:00', '09:30']); // dernier début à 09:30 → fin 10:30
  });

  it('garde-fous : step/durée ≤ 0 → aucun créneau', () => {
    expect(computeSlots({ ...base, slotStep: 0 })).toEqual([]);
    expect(computeSlots({ ...base, serviceDuration: 0 })).toEqual([]);
  });
});
