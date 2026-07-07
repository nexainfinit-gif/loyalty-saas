/**
 * Tests for computeDepositCents — calcul de l'acompte à la réservation.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { computeDepositCents } from '@/lib/stripe-connect';

describe('computeDepositCents', () => {
  it('returns null when deposits are disabled', () => {
    expect(computeDepositCents({ deposit_enabled: false, deposit_type: 'fixed', deposit_value: 10 }, 50)).toBeNull();
    expect(computeDepositCents({}, 50)).toBeNull();
  });

  it('fixed: returns the amount in cents', () => {
    expect(computeDepositCents({ deposit_enabled: true, deposit_type: 'fixed', deposit_value: 10 }, 50)).toBe(1000);
    expect(computeDepositCents({ deposit_enabled: true, deposit_type: 'fixed', deposit_value: 7.5 }, 50)).toBe(750);
  });

  it('percent: computes from the service price', () => {
    // 30% de 50 € = 15 € = 1500 cts
    expect(computeDepositCents({ deposit_enabled: true, deposit_type: 'percent', deposit_value: 30 }, 50)).toBe(1500);
    // 20% de 35 € = 7 €
    expect(computeDepositCents({ deposit_enabled: true, deposit_type: 'percent', deposit_value: 20 }, 35)).toBe(700);
  });

  it('returns null below the Stripe minimum (0,50 €)', () => {
    expect(computeDepositCents({ deposit_enabled: true, deposit_type: 'fixed', deposit_value: 0.4 }, 50)).toBeNull();
    expect(computeDepositCents({ deposit_enabled: true, deposit_type: 'percent', deposit_value: 1 }, 20)).toBeNull(); // 0,20 €
    expect(computeDepositCents({ deposit_enabled: true, deposit_type: 'fixed', deposit_value: 0 }, 50)).toBeNull();
  });

  it('rounds half-cent amounts correctly', () => {
    // 15% de 9,99 € = 1,4985 € → 150 cts
    expect(computeDepositCents({ deposit_enabled: true, deposit_type: 'percent', deposit_value: 15 }, 9.99)).toBe(150);
  });
});
