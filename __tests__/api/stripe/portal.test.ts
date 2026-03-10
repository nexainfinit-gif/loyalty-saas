import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockFrom, mockRequireAuth, mockStripe } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockStripe: {
    billingPortal: { sessions: { create: vi.fn() } },
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock('@/lib/server-auth', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/stripe', () => ({
  stripe: mockStripe,
}));

import { POST } from '@/app/api/stripe/portal/route';
import { buildRequest } from '@/__tests__/helpers/request';
import { RESTAURANT, AUTH_CONTEXT } from '@/__tests__/helpers/fixtures';

// ---------------------------------------------------------------------------
// Chainable Supabase mock
// ---------------------------------------------------------------------------
function chain(overrides: Record<string, unknown> = {}) {
  const c: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not',
    'in', 'is', 'like', 'ilike', 'or', 'filter',
    'order', 'limit', 'range', 'head', 'match',
  ];
  for (const m of methods) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue({ data: null, error: null });
  c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  Object.assign(c, overrides);
  return c;
}

function postReq() {
  return buildRequest('/api/stripe/portal', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/stripe/portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ ...AUTH_CONTEXT, restaurantId: RESTAURANT.id });
  });

  it('returns 401 when not authenticated', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }),
    );

    const res = await POST(postReq());
    expect(res.status).toBe(401);
  });

  it('returns 400 when restaurant has no stripe_customer_id', async () => {
    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { stripe_customer_id: null },
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') return restaurantChain;
      return chain();
    });

    const res = await POST(postReq());
    expect(res.status).toBe(400);
  });

  it('returns portal URL when customer exists', async () => {
    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { stripe_customer_id: 'cus_123' },
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') return restaurantChain;
      return chain();
    });

    mockStripe.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
    });

    const res = await POST(postReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://billing.stripe.com/session/test');
  });
});
