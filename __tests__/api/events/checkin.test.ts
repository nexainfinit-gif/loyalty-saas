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

import { POST } from '@/app/api/events/checkin/route';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const EVENT_A = {
  id: 'event-a-001',
  restaurant_id: RESTAURANT.id,
  title: 'Concert Test',
  starts_at: '2026-08-01T20:00:00Z',
  capacity: 100,
};

const TICKET_VALID = {
  id: 'tk-001',
  event_id: EVENT_A.id,
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

function seedDb(tickets: Record<string, unknown>[] = [{ ...TICKET_VALID }, { ...TICKET_B }]) {
  dbHolder.db = createFakeDb({
    events: [{ ...EVENT_A }, { id: 'event-b-001', restaurant_id: RESTAURANT_B.id, title: 'Event B', starts_at: '2026-08-02T20:00:00Z', capacity: 50 }],
    event_tickets: tickets,
  });
  return dbHolder.db;
}

function checkin(code: string) {
  return POST(buildRequest('/api/events/checkin', { method: 'POST', body: { code } }));
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

  it('ISOLATION : un billet de l\'établissement B est invalid pour A', async () => {
    const json = await (await checkin('EV-BBBB-3333')).json();
    expect(json.result).toBe('invalid');
    // Le billet de B n'a PAS été consommé
    const row = dbHolder.db.rows('event_tickets').find(r => r.id === 'tk-b-001');
    expect(row?.status).toBe('valid');
  });

  it('staff refusé par le guard → la réponse du guard est renvoyée', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }));
    const res = await checkin('EV-AAAA-2222');
    expect(res.status).toBe(403);
  });
});
