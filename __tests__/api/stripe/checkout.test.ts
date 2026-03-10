import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockFrom, mockRequireAuth, mockStripe } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockStripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
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

import { POST } from '@/app/api/stripe/checkout/route';
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

function postReq(body: unknown) {
  return buildRequest('/api/stripe/checkout', { method: 'POST', body });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ ...AUTH_CONTEXT, restaurantId: RESTAURANT.id });
  });

  it('returns 401 when not authenticated', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }),
    );

    const res = await POST(postReq({ planId: 'plan-pro' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when planId is missing', async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('planId');
  });

  it('returns 400 when plan has no stripe_price_id', async () => {
    const planChain = chain({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'plan-free', key: 'free', stripe_price_id: null },
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'plans') return planChain;
      return chain();
    });

    const res = await POST(postReq({ planId: 'plan-free' }));
    expect(res.status).toBe(400);
  });

  it('creates Stripe customer and checkout session on valid input', async () => {
    const planChain = chain({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'plan-pro', key: 'pro', stripe_price_id: 'price_xxx' },
        error: null,
      }),
    });

    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: RESTAURANT.id, stripe_customer_id: null, name: RESTAURANT.name },
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'plans') return planChain;
      if (table === 'restaurants') return restaurantChain;
      return chain();
    });

    mockStripe.customers.create.mockResolvedValue({ id: 'cus_new123' });
    mockStripe.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
    });

    const res = await POST(postReq({ planId: 'plan-pro' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://checkout.stripe.com/test');
    expect(mockStripe.customers.create).toHaveBeenCalledOnce();
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledOnce();
  });

  it('reuses existing stripe_customer_id', async () => {
    const planChain = chain({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'plan-pro', key: 'pro', stripe_price_id: 'price_xxx' },
        error: null,
      }),
    });

    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: RESTAURANT.id, stripe_customer_id: 'cus_existing', name: RESTAURANT.name },
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'plans') return planChain;
      if (table === 'restaurants') return restaurantChain;
      return chain();
    });

    mockStripe.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/existing',
    });

    const res = await POST(postReq({ planId: 'plan-pro' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://checkout.stripe.com/existing');
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
  });
});
