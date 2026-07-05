/**
 * Multi-tenant isolation tests for DELETE /api/customers/[id] (GDPR deletion).
 *
 * Asserts that restaurant A can never read or delete restaurant B's customers,
 * even when authenticated — the core "restaurant_id isolation" security rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, type FakeDb } from '../../helpers/fake-db';
import { buildRequest, buildParams } from '../../helpers/request';
import { RESTAURANT, RESTAURANT_B, CUSTOMER } from '../../helpers/fixtures';

const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => dbHolder.db.from(table) },
}));

const mockRequireOwner = vi.fn();
vi.mock('@/lib/server-auth', () => ({
  requireOwner: (req: Request) => mockRequireOwner(req),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { DELETE } from '@/app/api/customers/[id]/route';

const CUSTOMER_B = {
  ...CUSTOMER,
  id: 'cust-b-001',
  restaurant_id: RESTAURANT_B.id,
  first_name: 'Bob',
  qr_token: 'qr-token-bob-002',
};

function seedDb() {
  dbHolder.db = createFakeDb({
    customers: [{ ...CUSTOMER }, { ...CUSTOMER_B }],
    wallet_passes: [
      { id: 'pass-a', customer_id: CUSTOMER.id, restaurant_id: RESTAURANT.id, status: 'active' },
      { id: 'pass-b', customer_id: CUSTOMER_B.id, restaurant_id: RESTAURANT_B.id, status: 'active' },
    ],
    transactions: [
      { id: 'tx-a', customer_id: CUSTOMER.id, restaurant_id: RESTAURANT.id, points_delta: 10 },
      { id: 'tx-b', customer_id: CUSTOMER_B.id, restaurant_id: RESTAURANT_B.id, points_delta: 10 },
    ],
  });
}

function del(customerId: string) {
  const req = buildRequest(`/api/customers/${customerId}`, { method: 'DELETE' });
  return DELETE(req, buildParams({ id: customerId }));
}

beforeEach(() => {
  vi.clearAllMocks();
  seedDb();
  // Authenticated as restaurant A's owner
  mockRequireOwner.mockResolvedValue({
    restaurantId: RESTAURANT.id,
    userId: RESTAURANT.owner_id,
    platformRole: 'owner',
  });
});

describe('DELETE /api/customers/[id] — multi-tenant isolation', () => {
  it("returns 404 when restaurant A targets restaurant B's customer — nothing deleted", async () => {
    const res = await del(CUSTOMER_B.id);

    expect(res.status).toBe(404);

    // B's data fully intact
    expect(dbHolder.db.rows('customers').find((c) => c.id === CUSTOMER_B.id)).toBeDefined();
    expect(dbHolder.db.rows('transactions').find((t) => t.id === 'tx-b')).toBeDefined();
    const passB = dbHolder.db.rows('wallet_passes').find((p) => p.id === 'pass-b')!;
    expect(passB.status).toBe('active'); // not revoked
  });

  it('deletes its OWN customer with full GDPR cascade', async () => {
    const res = await del(CUSTOMER.id);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // A's customer + transactions gone, pass revoked
    expect(dbHolder.db.rows('customers').find((c) => c.id === CUSTOMER.id)).toBeUndefined();
    expect(dbHolder.db.rows('transactions').find((t) => t.id === 'tx-a')).toBeUndefined();
    const passA = dbHolder.db.rows('wallet_passes').find((p) => p.id === 'pass-a')!;
    expect(passA.status).toBe('revoked');

    // B's world untouched by A's cascade
    expect(dbHolder.db.rows('customers').find((c) => c.id === CUSTOMER_B.id)).toBeDefined();
    expect(dbHolder.db.rows('transactions').find((t) => t.id === 'tx-b')).toBeDefined();
  });

  it('returns 404 when the guard has no restaurant', async () => {
    mockRequireOwner.mockResolvedValue({ restaurantId: null, userId: 'u-1', platformRole: 'owner' });
    const res = await del(CUSTOMER.id);
    expect(res.status).toBe(404);
  });
});
