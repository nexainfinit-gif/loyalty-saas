/**
 * Tests for POST /api/events/[id]/tickets/transfer — transfert d'un billet.
 *
 * Covers : happy path (ancien void + nouveau billet héritier + lignée +
 * email + push), verrou d'état (scanné/déjà transféré), événement annulé,
 * isolation multi-tenant, validation du destinataire.
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

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/email', () => ({
  sendEventTicketsEmail: (p: unknown) => mockSendEmail(p),
}));

import { POST } from '@/app/api/events/[id]/tickets/transfer/route';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const EVENT_ID = 'ceceb0de-0000-4000-8000-000000000001';
const TICKET_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const EVENT = {
  id: EVENT_ID,
  restaurant_id: RESTAURANT.id,
  title: 'Concert Test',
  starts_at: '2026-08-01T20:00:00Z',
  location: 'Salle A',
  status: 'published',
};

const TICKET = {
  id: TICKET_ID,
  event_id: EVENT_ID,
  restaurant_id: RESTAURANT.id,
  code: 'EV-AAAA-2222',
  buyer_name: 'Alice Achat',
  buyer_email: 'alice@test.be',
  amount: 23,
  status: 'valid',
  stripe_checkout_session_id: 'cs_test_123',
  paid_at: '2026-07-01T10:00:00Z',
  tier_id: null,
  tier_name: 'VIP',
  seats: 4,
  transferred_at: null,
  transferred_to_ticket_id: null,
};

function seedDb(ticket: Record<string, unknown> = { ...TICKET }, event: Record<string, unknown> = { ...EVENT }) {
  dbHolder.db = createFakeDb({
    events: [event],
    event_tickets: [ticket],
    restaurants: [{ id: RESTAURANT.id, name: "N'joys", primary_color: '#111827' }],
    wallet_passes: [{ id: 'wp-1', event_ticket_id: TICKET_ID, status: 'active' }],
    audit_log: [],
  });
  return dbHolder.db;
}

function transfer(body: Record<string, unknown> = {}) {
  return POST(
    buildRequest(`/api/events/${EVENT_ID}/tickets/transfer`, {
      method: 'POST',
      body: { ticketId: TICKET_ID, buyerName: 'Bob Reprise', buyerEmail: 'bob@test.be', ...body },
    }),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );
}

beforeEach(() => {
  seedDb();
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
  mockRequireAuth.mockResolvedValue({ restaurantId: RESTAURANT.id, userId: 'user-1' });
});

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('POST /api/events/[id]/tickets/transfer', () => {
  it('void l\'ancien billet, émet un héritier (tier/montant/paiement), lie la lignée, email + push', async () => {
    const res = await transfer();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.newCode).toMatch(/^EV-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(json.newCode).not.toBe('EV-AAAA-2222');

    const rows = dbHolder.db.rows('event_tickets');
    const old = rows.find(r => r.id === TICKET_ID)!;
    const fresh = rows.find(r => r.id !== TICKET_ID)!;
    // Ancien : void + lignée
    expect(old.status).toBe('transferred');
    expect(old.transferred_at).toBeTruthy();
    expect(old.transferred_to_ticket_id).toBe(fresh.id);
    // Nouveau : mêmes droits, nouveau titulaire, remboursable (lignée Stripe)
    expect(fresh.status).toBe('valid');
    expect(fresh.buyer_name).toBe('Bob Reprise');
    expect(fresh.buyer_email).toBe('bob@test.be');
    expect(fresh.amount).toBe(23);
    expect(fresh.tier_name).toBe('VIP');
    expect(fresh.seats).toBe(4);
    expect(fresh.stripe_checkout_session_id).toBe('cs_test_123');

    // Livraison au destinataire + pass de l'ancien mis à jour
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'bob@test.be',
      tickets: [expect.objectContaining({ code: json.newCode, label: 'VIP · 4 places' })],
    }));
    expect(mockPush).toHaveBeenCalledWith('wp-1');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'event_ticket_transfer' }));
  });

  it('billet déjà scanné → 409, aucun billet émis', async () => {
    seedDb({ ...TICKET, status: 'checked_in' });
    const res = await transfer();
    expect(res.status).toBe(409);
    expect(dbHolder.db.rows('event_tickets')).toHaveLength(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('billet déjà transféré → 409 avec message dédié', async () => {
    seedDb({ ...TICKET, status: 'transferred' });
    const res = await transfer();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('déjà été transféré');
  });

  it('événement annulé → 409 (rembourser, pas transférer)', async () => {
    seedDb({ ...TICKET }, { ...EVENT, status: 'cancelled' });
    const res = await transfer();
    expect(res.status).toBe(409);
    expect(dbHolder.db.rows('event_tickets').find(r => r.id === TICKET_ID)?.status).toBe('valid');
  });

  it('ISOLATION : billet d\'un autre établissement → 404, intouché', async () => {
    seedDb({ ...TICKET, restaurant_id: RESTAURANT_B.id });
    const res = await transfer();
    expect(res.status).toBe(404);
    expect(dbHolder.db.rows('event_tickets')[0].status).toBe('valid');
  });

  it('email destinataire invalide → 400, rien ne bouge', async () => {
    const res = await transfer({ buyerEmail: 'pas-un-email' });
    expect(res.status).toBe(400);
    expect(dbHolder.db.rows('event_tickets')[0].status).toBe('valid');
  });

  it('échec d\'envoi email : le transfert TIENT (le code existe en base), erreur loguée', async () => {
    mockSendEmail.mockRejectedValue(new Error('resend down'));
    const res = await transfer();
    expect(res.status).toBe(200);
    expect(dbHolder.db.rows('event_tickets').find(r => r.id === TICKET_ID)?.status).toBe('transferred');
  });
});
