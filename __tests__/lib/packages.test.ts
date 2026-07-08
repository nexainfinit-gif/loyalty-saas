import { describe, it, expect } from 'vitest';
import {
  validatePackagePriceCents,
  validateSessions,
  defaultPackageExpiry,
  generatePackageCode,
} from '@/lib/packages';

describe('validatePackagePriceCents', () => {
  it('convertit en centimes dans les bornes', () => {
    expect(validatePackagePriceCents(50)).toBe(5000);
    expect(validatePackagePriceCents(1)).toBe(100);
    expect(validatePackagePriceCents(199.99)).toBe(19999);
  });
  it('rejette hors bornes / invalide', () => {
    expect(validatePackagePriceCents(0.5)).toBeNull();
    expect(validatePackagePriceCents(5001)).toBeNull();
    expect(validatePackagePriceCents(-1)).toBeNull();
    expect(validatePackagePriceCents('x')).toBeNull();
    expect(validatePackagePriceCents(NaN)).toBeNull();
  });
});

describe('validateSessions', () => {
  it('accepte les entiers dans les bornes', () => {
    expect(validateSessions(1)).toBe(1);
    expect(validateSessions(5)).toBe(5);
    expect(validateSessions(100)).toBe(100);
  });
  it('rejette 0, >100, décimaux, non-nombres', () => {
    expect(validateSessions(0)).toBeNull();
    expect(validateSessions(101)).toBeNull();
    expect(validateSessions(2.5)).toBeNull();
    expect(validateSessions('3')).toBeNull();
  });
});

describe('defaultPackageExpiry', () => {
  it('≈ 1 an dans le futur', () => {
    const days = (new Date(defaultPackageExpiry()).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });
});

describe('generatePackageCode', () => {
  it('format XXXX-XXXX sans caractères ambigus', () => {
    for (let i = 0; i < 30; i++) {
      expect(generatePackageCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});
