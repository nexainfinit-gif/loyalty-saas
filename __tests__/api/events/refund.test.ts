/**
 * Tests for POST /api/events/[id]/tickets/refund — remboursement d'un billet.
 *
 * Covers : billet payant (refund Stripe partiel sur le compte Connect),
 * billet gratuit (pas de Stripe), verrou d'état (déjà scanné/remboursé),
 * revert quand Stripe échoue, isolation multi-tenant, push du pass Wallet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, type FakeDb } from '../../helpers/fake-db';
import { buildRequest } from '../../helpers/request';
import { RESTAURANT, RESTAURANT_B } from '../../helpers/fixtures';

/* ── Module mocks ──────────────────────────────────────────────────────── */

const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => dbHolder.db.from(table) },
}));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/server-auth', () => ({
  requireAuth: (req: Request, opts?: unknown) => mockRequireAuth(req, opts),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ check: () => ({ success: true }) }),
  getClientIp: () => '127.0.0.1',
}));

const mockAuditLog = vi.fn();
vi.mock('@/lib/audit', () => ({ auditLog: (p: unknown) => mockAuditLog(p) }));

const mockPush = vi.fn();
vi.mock('@/lib/apns', () => ({ pushPassUpdate: (id: string) => mockPush(id) }));

const mockSessionRetrieve = vi.fn();
const mockRefundCreate = vi.fn();
vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: (...a: unknown[]) => mockSessionRetrieve(...a) } },
    refunds: { create: (...a: unknown[]) => mockRefundCreate(...a) },
  },
}));

import { POST } from '@/app/api/events/[id]/tickets/refund/route';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const EVENT_ID = 'ceceb0de-0000-4000-8000-000000000001';
const TICKET_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const TICKET_PAID = {
  id: TICKET_ID,
  event_id: EVENT_ID,
  restaurant_id: RESTAURANT.id,
  code: 'EV-AAAA-2222',
  buyer_name: 'Alice Achat',
  amount: 23,
  status: 'valid',
  refunded_at: null,
  stripe_checkout_session_id: 'cs_test_123',
};

function seedDb(ticket: Record<string, unknown> = { ...TICKET_PAID }) {
  dbHolder.db = createFakeDb({
    event_tickets: [ticket],
    restaurants: [{ id: RESTAURANT.id, stripe_account_id: 'acct_test' }],
    wallet_passes: [{ id: 'wp-1', event_ticket_id: TICKET_ID, status: 'active' }],
    audit_log: [],
  });
  return dbHolder.db;
}

function refund(ticketId = TICKET_ID, eventId = EVENT_ID) {
  return POST(
    buildRequest(`/api/events/${eventId}/tickets/refund`, { method: 'POST', body: { ticketId } }),
    { params: Promise.resolve({ id: eventId }) },
  );
}

beforeEach(() => {
  seedDb();
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ restaurantId: RESTAURANT.id, userId: 'user-1' });
  mockSessionRetrieve.mockResolvedValue({ payment_intent: 'pi_test_1' });
  mockRefundCreate.mockResolvedValue({ id: 're_test_1' });
});

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('POST /api/events/[id]/tickets/refund', () => {
  it('billet payant : refund Stripe PARTIEL sur le compte Connect + statut refunded + push du pass', async () => {
    const res = await refund();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.amount).toBe(23);

    // Refund partiel : montant de CE billet, sur le compte connecté
    expect(mockRefundCreate).toHaveBeenCalledWith(
      { payment_intent: 'pi_test_1', amount: 2300 },
      { stripeAccount: 'acct_test' },
    );
    const row = dbHolder.db.rows('event_tickets')[0];
    expect(row.status).toBe('refunded');
    expect(row.refunded_at).toBeTruthy();
    // Le pass Wallet reçoit son push (badge REMBOURSÉ + voided)
    expect(mockPush).toHaveBeenCalledWith('wp-1');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'event_ticket_refund' }));
  });

  it('billet gratuit : statut refunded SANS appel Stripe', async () => {
    seedDb({ ...TICKET_PAID, amount: 0, stripe_checkout_session_id: null });
    const res = await refund();
    expect((await res.json()).ok).toBe(true);
    expect(mockRefundCreate).not.toHaveBeenCalled();
    expect(dbHolder.db.rows('event_tickets')[0].status).toBe('refunded');
  });

  it('billet déjà scanné → 409, rien ne bouge', async () => {
    seedDb({ ...TICKET_PAID, status: 'checked_in' });
    const res = await refund();
    expect(res.status).toBe(409);
    expect(mockRefundCreate).not.toHaveBeenCalled();
    expect(dbHolder.db.rows('event_tickets')[0].status).toBe('checked_in');
  });

  it('billet déjà remboursé → 409 avec message dédié', async () => {
    seedDb({ ...TICKET_PAID, status: 'refunded' });
    const res = await refund();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('déjà remboursé');
  });

  it('ISOLATION : billet d\'un autre établissement → 404, intouché', async () => {
    seedDb({ ...TICKET_PAID, restaurant_id: RESTAURANT_B.id });
    const res = await refund();
    expect(res.status).toBe(404);
    expect(dbHolder.db.rows('event_tickets')[0].status).toBe('valid');
  });

  it('échec Stripe → REVERT : le billet redevient valide, 502 lisible', async () => {
    mockRefundCreate.mockRejectedValue(new Error('card_declined'));
    const res = await refund();
    expect(res.status).toBe(502);
    const row = dbHolder.db.rows('event_tickets')[0];
    expect(row.status).toBe('valid');
    expect(row.refunded_at).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('ticketId malformé → 400', async () => {
    const res = await refund('pas-un-uuid');
    expect(res.status).toBe(400);
  });
});
