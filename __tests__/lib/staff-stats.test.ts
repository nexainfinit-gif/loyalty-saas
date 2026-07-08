import { describe, it, expect } from 'vitest';
import { minutesBetween, availableMinutes, occupancyRate, type Availability } from '@/lib/staff-stats';

describe('minutesBetween', () => {
  it('calcule la durée en minutes', () => {
    expect(minutesBetween('09:00', '18:00')).toBe(540);
    expect(minutesBetween('09:00:00', '12:30:00')).toBe(210);
  });
  it('renvoie 0 pour incohérent / invalide', () => {
    expect(minutesBetween('18:00', '09:00')).toBe(0);
    expect(minutesBetween('abc', '18:00')).toBe(0);
  });
});

describe('availableMinutes', () => {
  // Lun–Ven 09:00–17:00 (480 min/jour), fermé week-end.
  const avails: Availability[] = [1, 2, 3, 4, 5].map((d) => ({
    day_of_week: d, start_time: '09:00', end_time: '17:00', is_working: true,
  }));

  it('somme les jours travaillés sur la période', () => {
    // 2026-07-06 (lun) → 2026-07-10 (ven) = 5 jours × 480 = 2400
    expect(availableMinutes(avails, new Set(), '2026-07-06', '2026-07-10')).toBe(2400);
  });
  it('exclut le week-end', () => {
    // sam+dim uniquement → 0
    expect(availableMinutes(avails, new Set(), '2026-07-11', '2026-07-12')).toBe(0);
  });
  it('déduit les jours de congé', () => {
    // lun–ven moins mercredi 08 = 4 × 480 = 1920
    expect(availableMinutes(avails, new Set(['2026-07-08']), '2026-07-06', '2026-07-10')).toBe(1920);
  });
  it('ignore les jours non travaillés (is_working=false)', () => {
    const off = avails.map((a) => a.day_of_week === 3 ? { ...a, is_working: false } : a);
    expect(availableMinutes(off, new Set(), '2026-07-06', '2026-07-10')).toBe(1920);
  });
  it('0 disponibilité → 0', () => {
    expect(availableMinutes([], new Set(), '2026-07-06', '2026-07-10')).toBe(0);
  });
});

describe('occupancyRate', () => {
  it('booked / available en %', () => {
    expect(occupancyRate(1200, 2400)).toBe(50);
    expect(occupancyRate(2400, 2400)).toBe(100);
  });
  it('plafonne à 100 (surbooking)', () => {
    expect(occupancyRate(3000, 2400)).toBe(100);
  });
  it('0 disponible → 0 (pas de division par zéro)', () => {
    expect(occupancyRate(500, 0)).toBe(0);
  });
});
