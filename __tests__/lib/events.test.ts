import { describe, it, expect } from 'vitest';
import {
  generateTicketCode, platformFeeCents, validateEventPriceCents,
  validateQuantity, eventSlug,
} from '@/lib/events';

describe('generateTicketCode', () => {
  it('format EV-XXXX-XXXX sans caractères ambigus', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateTicketCode();
      expect(code).toMatch(/^EV-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]$/);
    }
  });
  it('codes uniques sur un échantillon', () => {
    const set = new Set(Array.from({ length: 1000 }, generateTicketCode));
    expect(set.size).toBe(1000);
  });
});

describe('platformFeeCents', () => {
  it('1,5 % + 0,25 € par billet payant', () => {
    // 20 € : 30 + 25 = 55 centimes
    expect(platformFeeCents(2000, 1)).toBe(55);
    expect(platformFeeCents(2000, 4)).toBe(220);
    // 10 € : 15 + 25 = 40 centimes
    expect(platformFeeCents(1000, 2)).toBe(80);
  });
  it('rien sur les billets gratuits', () => {
    expect(platformFeeCents(0, 3)).toBe(0);
    expect(platformFeeCents(-100, 1)).toBe(0);
  });
});

describe('validateEventPriceCents', () => {
  it('accepte 0 (gratuit) à 500 €', () => {
    expect(validateEventPriceCents(0)).toBe(0);
    expect(validateEventPriceCents(12.5)).toBe(1250);
    expect(validateEventPriceCents(500)).toBe(50000);
  });
  it('rejette négatif, > 500 € et non-numérique', () => {
    expect(validateEventPriceCents(-1)).toBeNull();
    expect(validateEventPriceCents(500.01)).toBeNull();
    expect(validateEventPriceCents('abc')).toBeNull();
    expect(validateEventPriceCents(NaN)).toBeNull();
  });
});

describe('validateQuantity', () => {
  it('accepte 1 à 6 entiers', () => {
    expect(validateQuantity(1)).toBe(1);
    expect(validateQuantity(6)).toBe(6);
  });
  it('rejette 0, 7, décimaux et non-numérique', () => {
    expect(validateQuantity(0)).toBeNull();
    expect(validateQuantity(7)).toBeNull();
    expect(validateQuantity(2.5)).toBeNull();
    expect(validateQuantity('x')).toBeNull();
  });
});

describe('eventSlug', () => {
  it('slugifie avec accents et ponctuation', () => {
    expect(eventSlug('Concert Acoustique — Été 2026 !')).toBe('concert-acoustique-ete-2026');
    expect(eventSlug('  Atelier & Dégustation  ')).toBe('atelier-degustation');
  });
  it('tronque à 60 caractères', () => {
    expect(eventSlug('a'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});
