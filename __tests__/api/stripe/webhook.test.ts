import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockFrom, mockStripe } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockStripe: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock('@/lib/stripe', () => ({
  stripe: mockStripe,
}));

import { POST } from '@/app/api/stripe/webhook/route';

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

function buildWebhookRequest(body: string, signature = 'sig_test') {
  return new Request('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stripe-signature header is missing', async () => {
    const req = new Request('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signature verification fails', async () => {
    mockStripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const res = await POST(buildWebhookRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('handles checkout.session.completed and updates restaurant', async () => {
    const subscriptionData = {
      id: 'sub_123',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
    };

    mockStripe.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { restaurantId: 'rest-001', planId: 'plan-pro', planKey: 'pro' },
          subscription: 'sub_123',
        },
      },
    });

    mockStripe.subscriptions.retrieve.mockResolvedValue(subscriptionData);

    const restaurantChain = chain();
    mockFrom.mockImplementation(() => restaurantChain);

    const res = await POST(buildWebhookRequest('{"type":"checkout.session.completed"}'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
  });

  it('handles customer.subscription.deleted and downgrades to free', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          metadata: { restaurantId: 'rest-001' },
        },
      },
    });

    const restaurantChain = chain();
    const plansChain = chain({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'plan-free', key: 'free' },
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'plans') return plansChain;
      return restaurantChain;
    });

    const res = await POST(buildWebhookRequest('{"type":"customer.subscription.deleted"}'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
  });

  it('handles invoice.payment_failed and sets status to past_due', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_123',
        },
      },
    });

    const restaurantChain = chain({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'rest-001' },
        error: null,
      }),
    });

    mockFrom.mockImplementation(() => restaurantChain);

    const res = await POST(buildWebhookRequest('{"type":"invoice.payment_failed"}'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
  });

  it('acknowledges unhandled event types', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue({
      type: 'some.other.event',
      data: { object: {} },
    });

    const res = await POST(buildWebhookRequest('{}'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
  });
});
