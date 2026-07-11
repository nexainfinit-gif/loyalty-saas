/**
 * Tests for POST /api/compaigns avec eventId — annonce d'événement.
 *
 * Covers : audience (clients fidélité consentants ∪ acheteurs opt-in,
 * dédupliqués par email), liens de désinscription par type de
 * destinataire, bypass du gate campaigns_email (produit billetterie),
 * aucune audience → 400, isolation multi-tenant.
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
const mockRequireFeature = vi.fn();
vi.mock('@/lib/server-auth', () => ({
  requireAuth: (req: Request, opts?: unknown) => mockRequireAuth(req, opts),
  requireFeature: (...a: unknown[]) => mockRequireFeature(...a),
}));

vi.mock('@/lib/plan-limits', () => ({
  checkPlanLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 8, current: 0 }),
  checkEmailQuota: vi.fn().mockResolvedValue({ allowed: true, limit: 1000, current: 0 }),
  planLimitError: () => ({ upgrade: true }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockAuditLog = vi.fn();
vi.mock('@/lib/audit', () => ({ auditLog: (p: unknown) => mockAuditLog(p) }));

const mockSend = vi.fn().mockResolvedValue({ id: 'em_1' });
const mockBatchSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (p: unknown) => mockSend(p) };
    batch = { send: (p: unknown) => mockBatchSend(p) };
  },
}));

import { POST } from '@/app/api/compaigns/route';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const EVENT_ID = 'ceceb0de-0000-4000-8000-000000000001';

const EVENT = {
  id: EVENT_ID,
  restaurant_id: RESTAURANT.id,
  title: 'Concert Test',
  slug: 'concert-test',
  starts_at: '2026-08-01T20:00:00Z',
  location: 'Salle A',
  price: 15,
  status: 'published',
};

function seedDb(overrides: Record<string, Record<string, unknown>[]> = {}) {
  dbHolder.db = createFakeDb({
    restaurants: [{ id: RESTAURANT.id, name: "N'joys", primary_color: '#4f6bed', slug: 'n-joys' }],
    events: [{ ...EVENT }],
    customers: [
      { restaurant_id: RESTAURANT.id, first_name: 'Alice', email: 'alice@test.be', consent_marketing: true, qr_token: 'qr-alice' },
      { restaurant_id: RESTAURANT.id, first_name: 'Nora', email: 'nora@test.be', consent_marketing: false, qr_token: 'qr-nora' },
    ],
    event_tickets: [
      // Opt-in → destinataire
      { restaurant_id: RESTAURANT.id, buyer_email: 'bob@test.be', buyer_name: 'Bob Concert', code: 'EV-BBBB-2222', status: 'valid', marketing_opt_in: true },
      // Même email qu'une cliente fidélité → dédupliqué
      { restaurant_id: RESTAURANT.id, buyer_email: 'alice@test.be', buyer_name: 'Alice A', code: 'EV-AAAA-2222', status: 'checked_in', marketing_opt_in: true },
      // Pas d'opt-in → jamais contacté
      { restaurant_id: RESTAURANT.id, buyer_email: 'carl@test.be', buyer_name: 'Carl', code: 'EV-CCCC-2222', status: 'valid', marketing_opt_in: false },
    ],
    campaigns: [],
    ...overrides,
  });
}

function announce(body: Record<string, unknown> = {}) {
  return POST(buildRequest('/api/compaigns', {
    method: 'POST',
    body: {
      eventId: EVENT_ID,
      name: 'Annonce — Concert Test',
      subject: '{{prenom}}, Concert Test arrive !',
      bodyText: 'Bonjour {{prenom}}, réservez vite.',
      ...body,
    },
  }));
}

beforeEach(() => {
  seedDb();
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ id: 'em_1' });
  mockBatchSend.mockResolvedValue({ data: { data: [{ id: 'b1' }, { id: 'b2' }] }, error: null });
  mockRequireAuth.mockResolvedValue({ restaurantId: RESTAURANT.id, userId: 'user-1', plan: 'free', features: {} });
  // Le plan gratuit N'A PAS campaigns_email : le gate renverrait 403…
  const { NextResponse } = require('next/server');
  mockRequireFeature.mockReturnValue(NextResponse.json({ error: 'upgrade' }, { status: 403 }));
});

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('POST /api/compaigns (annonce d\'événement)', () => {
  it('audience = clients consentants ∪ acheteurs opt-in, dédupliqués — le gate campaigns_email ne s\'applique PAS', async () => {
    const res = await announce();
    const json = await res.json();
    expect(res.status).toBe(200);
    // Alice (cliente, aussi acheteuse → 1 seule fois) + Bob (acheteur opt-in).
    // Nora (pas de consentement) et Carl (pas d'opt-in) : jamais.
    expect(json.total).toBe(2);
    expect(json.sent).toBe(2);

    const batch = mockBatchSend.mock.calls[0][0] as { to: string; subject: string; html: string }[];
    const to = batch.map(b => b.to).sort();
    expect(to).toEqual(['alice@test.be', 'bob@test.be']);
    // Personnalisation + désinscription propre à chaque type de destinataire
    const alice = batch.find(b => b.to === 'alice@test.be')!;
    expect(alice.subject).toContain('Alice');
    expect(alice.html).toContain('/api/unsubscribe?token=qr-alice');
    const bob = batch.find(b => b.to === 'bob@test.be')!;
    expect(bob.subject).toContain('Bob');
    expect(bob.html).toContain('/api/event/unsubscribe?code=EV-BBBB-2222');
    // CTA vers la page de l'événement
    expect(bob.html).toContain('/fr/event/n-joys/concert-test');

    // Campagne tracée
    const camp = dbHolder.db.rows('campaigns')[0];
    expect(camp.type).toBe('event');
    expect(camp.status).toBe('sent');
  });

  it('aucun destinataire (personne n\'a opté) → 400 explicite, rien n\'est envoyé', async () => {
    seedDb({ customers: [], event_tickets: [] });
    const res = await announce();
    expect(res.status).toBe(400);
    expect(mockBatchSend).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('événement d\'un autre établissement → 404', async () => {
    seedDb({ events: [{ ...EVENT, restaurant_id: RESTAURANT_B.id }] });
    const res = await announce();
    expect(res.status).toBe(404);
  });

  it('événement en brouillon → 404 (on n\'annonce que du publié)', async () => {
    seedDb({ events: [{ ...EVENT, status: 'draft' }] });
    const res = await announce();
    expect(res.status).toBe(404);
  });

  it('une campagne classique (sans eventId) reste soumise au gate du plan', async () => {
    const res = await POST(buildRequest('/api/compaigns', {
      method: 'POST',
      body: { name: 'Promo', subject: 'Promo', bodyText: 'Hello', segment: 'all' },
    }));
    expect(res.status).toBe(403);
  });
});
