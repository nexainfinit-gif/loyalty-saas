/**
 * Tests for refreshAppointmentOnPass — le prochain RDV affiché sur la carte
 * Wallet (synergie booking × fidélité, Phase A).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, type FakeDb } from '../helpers/fake-db';

const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => dbHolder.db.from(table) },
}));

const mockPush = vi.fn().mockResolvedValue([{ success: true }]);
vi.mock('@/lib/apns', () => ({ pushPassUpdate: (id: string) => mockPush(id) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { refreshAppointmentOnPass } from '@/lib/booking-wallet';

const RID = 'rest-001';
const EMAIL = 'alice@example.com';
const future = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function seed(overrides: Record<string, Record<string, unknown>[]> = {}) {
  dbHolder.db = createFakeDb({
    customers: [{ id: 'cust-1', restaurant_id: RID, email: EMAIL }],
    services: [{ id: 'svc-1', name: 'Coupe Femme' }],
    appointments: [],
    wallet_passes: [{
      id: 'pass-1', restaurant_id: RID, customer_id: 'cust-1',
      platform: 'apple', status: 'active', promo_message: null,
    }],
    ...overrides,
  });
}

beforeEach(() => { vi.clearAllMocks(); seed(); });

describe('refreshAppointmentOnPass', () => {
  it('writes the next confirmed appointment on the pass and pushes APNS', async () => {
    seed({
      appointments: [
        { id: 'a2', restaurant_id: RID, client_email: EMAIL, status: 'confirmed', date: future(9), start_time: '11:00:00', service_id: 'svc-1' },
        { id: 'a1', restaurant_id: RID, client_email: EMAIL, status: 'confirmed', date: future(2), start_time: '14:30:00', service_id: 'svc-1' },
      ],
    });

    await refreshAppointmentOnPass(RID, EMAIL);

    const pass = dbHolder.db.rows('wallet_passes')[0];
    expect(pass.promo_message).toMatch(/^📅 /);           // convention préfixe
    expect(pass.promo_message).toContain('14:30');        // le PLUS PROCHE (a1)
    expect(pass.promo_message).toContain('Coupe Femme');
    expect(mockPush).toHaveBeenCalledWith('pass-1');
  });

  it('uses "Demain" for a next-day appointment (drives the J-1 reminder)', async () => {
    seed({
      appointments: [
        { id: 'a1', restaurant_id: RID, client_email: EMAIL, status: 'confirmed', date: future(1), start_time: '14:30:00', service_id: 'svc-1' },
      ],
    });
    await refreshAppointmentOnPass(RID, EMAIL);
    const pass = dbHolder.db.rows('wallet_passes')[0];
    expect(pass.promo_message).toContain('Demain');
    expect(pass.promo_message).toContain('14:30');
    expect(mockPush).toHaveBeenCalledWith('pass-1');
  });

  it('clears the message when no upcoming appointment remains', async () => {
    seed({
      appointments: [
        { id: 'a1', restaurant_id: RID, client_email: EMAIL, status: 'cancelled', date: future(2), start_time: '14:30:00', service_id: 'svc-1' },
      ],
      wallet_passes: [{
        id: 'pass-1', restaurant_id: RID, customer_id: 'cust-1',
        platform: 'apple', status: 'active', promo_message: '📅 mar. 9 juil. à 14:30 — Coupe Femme',
      }],
    });

    await refreshAppointmentOnPass(RID, EMAIL);

    expect(dbHolder.db.rows('wallet_passes')[0].promo_message).toBeNull();
    expect(mockPush).toHaveBeenCalled();
  });

  it('does not push when the message is unchanged (idempotent)', async () => {
    seed(); // aucun RDV, promo_message déjà null
    await refreshAppointmentOnPass(RID, EMAIL);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('is a no-op for clients without a customer record or pass', async () => {
    seed({ customers: [] });
    await refreshAppointmentOnPass(RID, 'inconnu@example.com');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('ignores appointments of other restaurants (isolation)', async () => {
    seed({
      appointments: [
        { id: 'x', restaurant_id: 'rest-OTHER', client_email: EMAIL, status: 'confirmed', date: future(1), start_time: '10:00:00', service_id: 'svc-1' },
      ],
    });
    await refreshAppointmentOnPass(RID, EMAIL);
    expect(dbHolder.db.rows('wallet_passes')[0].promo_message).toBeNull();
  });

  it('never throws even if the DB layer fails', async () => {
    dbHolder.db = { from: () => { throw new Error('boom'); } } as unknown as FakeDb;
    await expect(refreshAppointmentOnPass(RID, EMAIL)).resolves.toBe(false);
  });
});
