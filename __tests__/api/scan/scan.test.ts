/**
 * Tests for POST /api/scan/[token] — the highest-traffic, highest-value route.
 *
 * Covers: token resolution, points/stamps math, reward threshold, stamp-card
 * completion + redemption cycle, idempotency, anti-fraud (max scans/day,
 * min delay), and MULTI-TENANT ISOLATION (restaurant A cannot scan
 * restaurant B's customers).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, applyLoyaltyTrigger, type FakeDb } from '../../helpers/fake-db';
import { buildRequest, buildParams } from '../../helpers/request';
import { RESTAURANT, RESTAURANT_B, CUSTOMER, LOYALTY_SETTINGS_POINTS, LOYALTY_SETTINGS_STAMPS } from '../../helpers/fixtures';

/* ── Module mocks ──────────────────────────────────────────────────────── */

// Mutable holder so each test can swap in a fresh fake DB
const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => dbHolder.db.from(table) },
}));

const mockRequireScannerAuth = vi.fn();
const mockRequireAuth = vi.fn();
vi.mock('@/lib/server-auth', () => ({
  requireScannerAuth: (req: Request) => mockRequireScannerAuth(req),
  requireAuth: (req: Request) => mockRequireAuth(req),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ check: () => ({ success: true }) }),
  getClientIp: () => '127.0.0.1',
}));

vi.mock('@/lib/apns', () => ({ pushPassUpdate: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/email', () => ({
  sendRewardReachedEmail: vi.fn().mockResolvedValue(undefined),
  sendNearRewardEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/i18n-server', () => ({
  defaultLocale: 'fr',
  locales: ['fr', 'en', 'nl', 'it', 'es'],
  getTranslator: async () => (key: string) => key, // echo keys — assert on keys
}));

import { POST, GET } from '@/app/api/scan/[token]/route';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const CUSTOMER_B = {
  ...CUSTOMER,
  id: 'cust-b-001',
  restaurant_id: RESTAURANT_B.id,
  first_name: 'Bob',
  qr_token: 'qr-token-bob-002',
};

function seedDb(overrides: Record<string, Record<string, unknown>[]> = {}) {
  dbHolder.db = createFakeDb(
    {
      restaurants: [{ ...RESTAURANT }, { ...RESTAURANT_B }],
      customers: [{ ...CUSTOMER, reward_pending: false }, { ...CUSTOMER_B, reward_pending: false }],
      loyalty_settings: [{ ...LOYALTY_SETTINGS_POINTS }],
      wallet_passes: [],
      transactions: [],
      scan_events: [],
      wallet_sync_queue: [],
      point_multipliers: [],
      scan_actions: [],
      ...overrides,
    },
    { uniques: { scan_events: ['idempotency_key'] }, onInsert: applyLoyaltyTrigger },
  );
  return dbHolder.db;
}

function scan(token: string, body: Record<string, unknown> = {}) {
  const req = buildRequest(`/api/scan/${token}`, { method: 'POST', body });
  return POST(req, buildParams({ token }));
}

beforeEach(() => {
  vi.clearAllMocks();
  seedDb();
  // Authenticated as restaurant A's owner by default
  mockRequireScannerAuth.mockResolvedValue({ restaurantId: RESTAURANT.id, userId: RESTAURANT.owner_id });
  mockRequireAuth.mockResolvedValue({ restaurantId: RESTAURANT.id, userId: RESTAURANT.owner_id });
});

/* ── Core scan flow ────────────────────────────────────────────────────── */

describe('POST /api/scan/[token] — points mode', () => {
  it('resolves qr_token and awards points_per_scan', async () => {
    const res = await scan(CUSTOMER.qr_token);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.points_added).toBe(10);
    expect(json.customer.total_points).toBe(60); // 50 + 10

    // Financial record written, scoped to restaurant A
    const txs = dbHolder.db.rows('transactions');
    expect(txs).toHaveLength(1);
    expect(txs[0].restaurant_id).toBe(RESTAURANT.id);
    expect(txs[0].points_delta).toBe(10);

    // Audit trail written
    expect(dbHolder.db.rows('scan_events')).toHaveLength(1);
    // Wallet sync queued
    expect(dbHolder.db.rows('wallet_sync_queue')).toHaveLength(1);
  });

  it('accepts a full scan URL as QR payload and extracts the token', async () => {
    // Some QR codes contain the full scan URL (register success page)
    const rawQrValue = `https://app.rebites.be/api/scan/${CUSTOMER.qr_token}`;
    const req = buildRequest(`/api/scan/${encodeURIComponent(rawQrValue)}`, { method: 'POST', body: {} });
    const res = await POST(req, buildParams({ token: rawQrValue }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.customer.id).toBe(CUSTOMER.id);
  });

  it('triggers the reward exactly when crossing the threshold', async () => {
    // balance 95, +10 → crosses threshold 100
    seedDb({ customers: [{ ...CUSTOMER, total_points: 95, reward_pending: false }, { ...CUSTOMER_B }] });
    const res = await scan(CUSTOMER.qr_token);
    const json = await res.json();

    expect(json.reward_triggered).toBe(true);
    expect(json.customer.total_points).toBe(105);
  });

  it('does NOT trigger the reward when already past the threshold', async () => {
    seedDb({ customers: [{ ...CUSTOMER, total_points: 150, reward_pending: false }, { ...CUSTOMER_B }] });
    const json = await (await scan(CUSTOMER.qr_token)).json();
    expect(json.reward_triggered).toBe(false);
  });

  it('returns 404 for an unknown token', async () => {
    const res = await scan('totally-unknown-token');
    expect(res.status).toBe(404);
    expect(dbHolder.db.rows('transactions')).toHaveLength(0);
  });
});

/* ── Multi-tenant isolation ────────────────────────────────────────────── */

describe('POST /api/scan/[token] — multi-tenant isolation', () => {
  it("restaurant A CANNOT scan restaurant B's customer (404, no points awarded)", async () => {
    // Authenticated as A, presenting B's customer token
    const res = await scan(CUSTOMER_B.qr_token);

    expect(res.status).toBe(404);
    expect(dbHolder.db.rows('transactions')).toHaveLength(0);
    expect(dbHolder.db.rows('scan_events')).toHaveLength(0);

    // B's customer balance untouched
    const bob = dbHolder.db.rows('customers').find((c) => c.id === CUSTOMER_B.id)!;
    expect(bob.total_points).toBe(CUSTOMER_B.total_points);
  });

  it("restaurant A CANNOT scan restaurant B's customer via customer.id fallback", async () => {
    const res = await scan(CUSTOMER_B.id);
    expect(res.status).toBe(404);
    expect(dbHolder.db.rows('transactions')).toHaveLength(0);
  });

  it("restaurant B CAN scan its own customer with the same token", async () => {
    mockRequireScannerAuth.mockResolvedValue({ restaurantId: RESTAURANT_B.id, userId: RESTAURANT_B.owner_id });
    // B has no loyalty_settings row seeded → defaults apply (1 point/scan)
    const res = await scan(CUSTOMER_B.qr_token);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.customer.id).toBe(CUSTOMER_B.id);
    const txs = dbHolder.db.rows('transactions');
    expect(txs).toHaveLength(1);
    expect(txs[0].restaurant_id).toBe(RESTAURANT_B.id);
  });

  it('GET /api/scan/[token] does not leak customers across restaurants', async () => {
    const req = buildRequest(`/api/scan/${CUSTOMER_B.qr_token}`);
    const res = await GET(req, buildParams({ token: CUSTOMER_B.qr_token }));
    expect(res.status).toBe(404);
  });
});

/* ── Idempotency ───────────────────────────────────────────────────────── */

describe('POST /api/scan/[token] — idempotency', () => {
  const KEY = '123e4567-e89b-42d3-a456-426614174000';

  it('replays the cached response for a duplicate idempotency key (no double award)', async () => {
    const first = await (await scan(CUSTOMER.qr_token, { idempotency_key: KEY })).json();
    expect(first.customer.total_points).toBe(60);

    const second = await (await scan(CUSTOMER.qr_token, { idempotency_key: KEY })).json();
    expect(second).toEqual(first); // exact replay

    // Only ONE transaction + ONE scan event — no double points
    expect(dbHolder.db.rows('transactions')).toHaveLength(1);
    expect(dbHolder.db.rows('scan_events')).toHaveLength(1);
    const alice = dbHolder.db.rows('customers').find((c) => c.id === CUSTOMER.id)!;
    expect(alice.total_points).toBe(60);
  });

  it('rejects a malformed idempotency key with 400', async () => {
    const res = await scan(CUSTOMER.qr_token, { idempotency_key: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(dbHolder.db.rows('transactions')).toHaveLength(0);
  });
});

/* ── Anti-fraud ────────────────────────────────────────────────────────── */

describe('POST /api/scan/[token] — anti-fraud', () => {
  it('blocks when max_scans_per_day is reached (429)', async () => {
    const today = new Date().toISOString();
    seedDb({
      loyalty_settings: [{ ...LOYALTY_SETTINGS_POINTS, max_scans_per_day: 2 }],
      scan_events: [
        { id: 'ev-1', restaurant_id: RESTAURANT.id, customer_id: CUSTOMER.id, created_at: today },
        { id: 'ev-2', restaurant_id: RESTAURANT.id, customer_id: CUSTOMER.id, created_at: today },
      ],
    });

    const res = await scan(CUSTOMER.qr_token);
    expect(res.status).toBe(429);
    expect(dbHolder.db.rows('transactions')).toHaveLength(0);
  });

  it('blocks a scan arriving before min_scan_delay_minutes (429)', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    seedDb({
      loyalty_settings: [{ ...LOYALTY_SETTINGS_POINTS, min_scan_delay_minutes: 15 }],
      scan_events: [
        { id: 'ev-1', restaurant_id: RESTAURANT.id, customer_id: CUSTOMER.id, created_at: fiveMinAgo },
      ],
    });

    const res = await scan(CUSTOMER.qr_token);
    expect(res.status).toBe(429);
    expect(dbHolder.db.rows('transactions')).toHaveLength(0);
  });

  it('allows the scan once the min delay has elapsed', async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    seedDb({
      loyalty_settings: [{ ...LOYALTY_SETTINGS_POINTS, min_scan_delay_minutes: 15 }],
      scan_events: [
        { id: 'ev-1', restaurant_id: RESTAURANT.id, customer_id: CUSTOMER.id, created_at: thirtyMinAgo },
      ],
    });

    const res = await scan(CUSTOMER.qr_token);
    expect(res.status).toBe(200);
  });
});

/* ── Stamps mode: completion + redemption cycle ────────────────────────── */

describe('POST /api/scan/[token] — stamps mode', () => {
  it('adds a stamp on scan', async () => {
    seedDb({
      loyalty_settings: [{ ...LOYALTY_SETTINGS_STAMPS, points_per_scan: 1 }],
      customers: [{ ...CUSTOMER, stamps_count: 3, reward_pending: false }, { ...CUSTOMER_B }],
    });

    const json = await (await scan(CUSTOMER.qr_token)).json();
    expect(json.program_type).toBe('stamps');
    expect(json.customer.stamps_count).toBe(4);
    expect(json.stamp_card_completed).toBe(false);
  });

  it('completes the card at stamps_total, caps the count and flags reward_pending', async () => {
    seedDb({
      loyalty_settings: [{ ...LOYALTY_SETTINGS_STAMPS, points_per_scan: 1 }],
      customers: [{ ...CUSTOMER, stamps_count: 9, reward_pending: false }, { ...CUSTOMER_B }],
    });

    const json = await (await scan(CUSTOMER.qr_token)).json();
    expect(json.stamp_card_completed).toBe(true);
    expect(json.customer.stamps_count).toBe(10); // capped at stamps_total

    const alice = dbHolder.db.rows('customers').find((c) => c.id === CUSTOMER.id)!;
    expect(alice.reward_pending).toBe(true);
  });

  it('next scan redeems the reward: stamps reset to 0, completed_cards++', async () => {
    seedDb({
      loyalty_settings: [{ ...LOYALTY_SETTINGS_STAMPS, points_per_scan: 1 }],
      customers: [{ ...CUSTOMER, stamps_count: 10, reward_pending: true, completed_cards: 0 }, { ...CUSTOMER_B }],
    });

    const json = await (await scan(CUSTOMER.qr_token)).json();
    expect(json.reward_redeemed).toBe(true);
    expect(json.points_added).toBe(0);
    expect(json.customer.stamps_count).toBe(0);

    const alice = dbHolder.db.rows('customers').find((c) => c.id === CUSTOMER.id)!;
    expect(alice.reward_pending).toBe(false);
    expect(alice.completed_cards).toBe(1);

    // Redemption is recorded as a reward_redeem transaction with negative stamps delta
    const txs = dbHolder.db.rows('transactions');
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('reward_redeem');
    expect(txs[0].stamps_delta).toBe(-10);
  });
});

/* ── Per-pass counters (migration 031) ─────────────────────────────────── */

describe('POST /api/scan/[token] — per-pass counters', () => {
  it('increments the active pass counters alongside the customer', async () => {
    seedDb({
      wallet_passes: [{
        id: 'pass-001', customer_id: CUSTOMER.id, restaurant_id: RESTAURANT.id,
        status: 'active', pass_kind: 'points', platform: 'apple',
        total_points: 50, stamps_count: 0, reward_pending: false,
        created_at: '2026-06-01T00:00:00Z',
      }],
    });

    const json = await (await scan(CUSTOMER.qr_token)).json();
    expect(json.pass_id).toBe('pass-001');
    expect(json.customer.total_points).toBe(60); // pass-level counter after trigger

    const pass = dbHolder.db.rows('wallet_passes').find((p) => p.id === 'pass-001')!;
    expect(pass.total_points).toBe(60);

    const txs = dbHolder.db.rows('transactions');
    expect(txs[0].wallet_pass_id).toBe('pass-001');
  });
});

/* ── Scan actions & multipliers ────────────────────────────────────────── */

describe('POST /api/scan/[token] — scan actions', () => {
  it('applies the points_value of a valid scan action', async () => {
    seedDb({
      scan_actions: [{ id: 'action-001', restaurant_id: RESTAURANT.id, points_value: 25, label: 'Menu midi', is_active: true }],
    });

    const json = await (await scan(CUSTOMER.qr_token, { scan_action_id: 'action-001' })).json();
    expect(json.points_added).toBe(25);
    expect(json.scan_action_label).toBe('Menu midi');
  });

  it("rejects a scan action belonging to another restaurant (400)", async () => {
    seedDb({
      scan_actions: [{ id: 'action-b', restaurant_id: RESTAURANT_B.id, points_value: 999, label: 'Fraude', is_active: true }],
    });

    const res = await scan(CUSTOMER.qr_token, { scan_action_id: 'action-b' });
    expect(res.status).toBe(400);
    expect(dbHolder.db.rows('transactions')).toHaveLength(0);
  });
});
