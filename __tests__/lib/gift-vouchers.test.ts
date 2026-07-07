import { describe, it, expect } from 'vitest';
import { generateVoucherCode, validateGiftAmountCents, defaultExpiry } from '@/lib/gift-vouchers';

describe('generateVoucherCode', () => {
  it('format XXXX-XXXX sans caractères ambigus', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateVoucherCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });
  it('codes uniques sur un échantillon', () => {
    const set = new Set(Array.from({ length: 1000 }, generateVoucherCode));
    expect(set.size).toBe(1000);
  });
});

describe('validateGiftAmountCents', () => {
  it('accepte 5–500 € et convertit en centimes', () => {
    expect(validateGiftAmountCents(50)).toBe(5000);
    expect(validateGiftAmountCents(5)).toBe(500);
    expect(validateGiftAmountCents(500)).toBe(50000);
    expect(validateGiftAmountCents(19.99)).toBe(1999);
  });
  it('rejette hors bornes / invalide', () => {
    expect(validateGiftAmountCents(4.99)).toBeNull();
    expect(validateGiftAmountCents(500.01)).toBeNull();
    expect(validateGiftAmountCents(-10)).toBeNull();
    expect(validateGiftAmountCents('abc')).toBeNull();
    expect(validateGiftAmountCents(NaN)).toBeNull();
  });
});

describe('defaultExpiry', () => {
  it('≈ 1 an dans le futur', () => {
    const d = new Date(defaultExpiry());
    const days = (d.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });
});
