/**
 * Tests for POST /api/events/checkin — validation des billets à l'entrée (T2).
 *
 * Covers: happy path (valid → checked_in), double scan (already), codes
 * inconnus/malformés, billets non payés/annulés, et MULTI-TENANT ISOLATION
 * (l'établissement A ne peut pas valider les billets de B).
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
vi.mock('@/lib/audit', () => ({
  auditLog: (p: unknown) => mockAuditLog(p),
}));

import { POST } from '@/app/api/events/checkin/route';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const EVENT_A = {
  id: 'ceceb0de-0000-4000-8000-000000000001',
  restaurant_id: RESTAURANT.id,
  title: 'Concert Test',
  starts_at: '2026-08-01T20:00:00Z',
  capacity: 100,
  status: 'published',
};

const EVENT_A2 = {
  id: 'ceceb0de-0000-4000-8000-000000000002',
  restaurant_id: RESTAURANT.id,
  title: 'Autre Soirée',
  starts_at: '2026-08-05T20:00:00Z',
  capacity: 100,
  status: 'published',
};

const TICKET_VALID = {
  id: 'tk-001',
  event_id: 'ceceb0de-0000-4000-8000-000000000001',
  restaurant_id: RESTAURANT.id,
  code: 'EV-AAAA-2222',
  buyer_name: 'Alice Achat',
  status: 'valid',
  checked_in_at: null,
};

const TICKET_B = {
  id: 'tk-b-001',
  event_id: 'event-b-001',
  restaurant_id: RESTAURANT_B.id,
  code: 'EV-BBBB-3333',
  buyer_name: 'Bob B',
  status: 'valid',
  checked_in_at: null,
};

function seedDb(
  tickets: Record<string, unknown>[] = [{ ...TICKET_VALID }, { ...TICKET_B }],
  events: Record<string, unknown>[] = [
    { ...EVENT_A }, { ...EVENT_A2 },
    { id: 'event-b-001', restaurant_id: RESTAURANT_B.id, title: 'Event B', starts_at: '2026-08-02T20:00:00Z', capacity: 50, status: 'published' },
  ],
) {
  dbHolder.db = createFakeDb({
    events,
    event_tickets: tickets,
    audit_log: [],
  });
  return dbHolder.db;
}

function checkin(code: string, eventId?: string) {
  return POST(buildRequest('/api/events/checkin', { method: 'POST', body: { code, ...(eventId ? { eventId } : {}) } }));
}

beforeEach(() => {
  seedDb();
  mockRequireAuth.mockResolvedValue({ restaurantId: RESTAURANT.id, userId: 'user-1', memberRole: 'staff' });
});

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('POST /api/events/checkin', () => {
  it('valide un billet et le passe à checked_in', async () => {
    const res = await checkin('EV-AAAA-2222');
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.result).toBe('ok');
    expect(json.buyerName).toBe('Alice Achat');
    expect(json.eventTitle).toBe('Concert Test');
    expect(json.checkedIn).toBe(1);
    expect(json.total).toBe(1);

    const row = dbHolder.db.rows('event_tickets').find(r => r.id === 'tk-001');
    expect(row?.status).toBe('checked_in');
    expect(row?.checked_in_at).toBeTruthy();
  });

  it('accepte la casse basse (normalisation du code)', async () => {
    const res = await checkin('ev-aaaa-2222');
    const json = await res.json();
    expect(json.result).toBe('ok');
  });

  it('deuxième scan → already avec l\'heure du premier passage', async () => {
    await checkin('EV-AAAA-2222');
    const res = await checkin('EV-AAAA-2222');
    const json = await res.json();
    expect(json.result).toBe('already');
    expect(json.buyerName).toBe('Alice Achat');
    expect(json.checkedInAt).toBeTruthy();
  });

  it('code inconnu → invalid', async () => {
    const json = await (await checkin('EV-ZZZZ-9999')).json();
    expect(json.result).toBe('invalid');
  });

  it('code malformé → invalid (pas d\'erreur 500)', async () => {
    const json = await (await checkin('n-importe-quoi')).json();
    expect(json.result).toBe('invalid');
  });

  it('billet non payé (pending_payment) → invalid', async () => {
    seedDb([{ ...TICKET_VALID, status: 'pending_payment' }]);
    const json = await (await checkin('EV-AAAA-2222')).json();
    expect(json.result).toBe('invalid');
  });

  it('billet annulé → invalid', async () => {
    seedDb([{ ...TICKET_VALID, status: 'cancelled' }]);
    const json = await (await checkin('EV-AAAA-2222')).json();
    expect(json.result).toBe('invalid');
  });

  it('billet remboursé / transféré / statut inconnu → invalid, jamais « already » (051)', async () => {
    for (const status of ['refunded', 'transferred', 'statut_futur_inconnu']) {
      seedDb([{ ...TICKET_VALID, status }]);
      const json = await (await checkin('EV-AAAA-2222')).json();
      expect(json.result).toBe('invalid');
      // Le billet n'a pas été consommé ni requalifié
      expect(dbHolder.db.rows('event_tickets').find(r => r.id === 'tk-001')?.status).toBe(status);
    }
  });

  it('ISOLATION : un billet de l\'établissement B est invalid pour A', async () => {
    const json = await (await checkin('EV-BBBB-3333')).json();
    expect(json.result).toBe('invalid');
    // Le billet de B n'a PAS été consommé
    const row = dbHolder.db.rows('event_tickets').find(r => r.id === 'tk-b-001');
    expect(row?.status).toBe('valid');
  });

  it('ANTI-FRAUDE : billet d\'un événement annulé → invalid (event_cancelled)', async () => {
    seedDb([{ ...TICKET_VALID }], [{ ...EVENT_A, status: 'cancelled' }]);
    const json = await (await checkin('EV-AAAA-2222')).json();
    expect(json.result).toBe('invalid');
    expect(json.reason).toBe('event_cancelled');
    // Le billet n'a pas été consommé
    expect(dbHolder.db.rows('event_tickets').find(r => r.id === 'tk-001')?.status).toBe('valid');
  });

  it('ANTI-FRAUDE : épinglage — billet d\'un AUTRE événement → wrong_event, non consommé', async () => {
    const json = await (await checkin('EV-AAAA-2222', EVENT_A2.id)).json();
    expect(json.result).toBe('wrong_event');
    expect(json.eventTitle).toBe('Concert Test');
    expect(dbHolder.db.rows('event_tickets').find(r => r.id === 'tk-001')?.status).toBe('valid');
  });

  it('épinglage sur le BON événement → ok', async () => {
    const json = await (await checkin('EV-AAAA-2222', EVENT_A.id)).json();
    expect(json.result).toBe('ok');
  });

  it('un check-in réussi est journalisé dans l\'audit', async () => {
    mockAuditLog.mockClear();
    await checkin('EV-AAAA-2222');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'event_checkin',
      restaurantId: RESTAURANT.id,
      targetId: 'tk-001',
    }));
  });

  it('staff refusé par le guard → la réponse du guard est renvoyée', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }));
    const res = await checkin('EV-AAAA-2222');
    expect(res.status).toBe(403);
  });
});
