import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — vi.hoisted ensures the variable exists when vi.mock factories run
// ---------------------------------------------------------------------------
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: mockFrom, rpc: vi.fn() },
}));
vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: vi.fn(),
  sendBookingConfirmationEmail: vi.fn(),
  sendReminderEmail: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ check: () => ({ success: true, remaining: 10 }) }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/google-wallet', () => ({
  generateWalletUrl: vi.fn().mockResolvedValue('https://pay.google.com/test'),
  updateLoyaltyObject: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/wallet-auto-issue', () => ({
  autoIssueApplePass: vi.fn().mockResolvedValue(null),
}));

// Mock Resend so the route-level `new Resend(...)` doesn't make real calls
vi.mock('resend', () => {
  const send = vi.fn().mockResolvedValue({ id: 'email-001' });
  return {
    Resend: class {
      emails = { send };
    },
  };
});

import { POST } from '@/app/api/register/[slug]/route';
import { buildRequest, buildParams } from '@/__tests__/helpers/request';
import { RESTAURANT, CUSTOMER } from '@/__tests__/helpers/fixtures';

// ---------------------------------------------------------------------------
// Helpers to build chainable Supabase mocks per-table
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_BODY = {
  first_name: 'Alice',
  email: 'alice@example.com',
  birth_date: '1990-06-15',
  phone: '+33612345678',
  consent_marketing: true,
};

function slug() {
  return buildParams({ slug: 'chez-test' });
}

function postReq(body: unknown = VALID_BODY) {
  return buildRequest('/api/register/chez-test', { method: 'POST', body });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/register/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────────
  it('returns 200 and creates customer on valid input', async () => {
    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: RESTAURANT.id, name: RESTAURANT.name, primary_color: RESTAURANT.primary_color },
        error: null,
      }),
    });

    // from('customers') is called twice:
    //   1. Rate-limit count query: select('id', { count, head }).eq().gte() → awaited directly (no .single())
    //   2. Insert: insert().select().single()
    // We differentiate by tracking call count.
    const rateLimitChain = chain();
    // Make it thenable so `await` resolves to { count: 0 }
    (rateLimitChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ count: 0 }).then(resolve);

    const insertChain = chain({
      single: vi.fn().mockResolvedValue({ data: { ...CUSTOMER, id: 'cust-new' }, error: null }),
    });

    let customersCallCount = 0;

    const transactionsChain = chain({
      insert: vi.fn().mockReturnValue({ then: (r: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(r) }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') return restaurantChain;
      if (table === 'customers') {
        customersCallCount++;
        return customersCallCount === 1 ? rateLimitChain : insertChain;
      }
      if (table === 'transactions') return transactionsChain;
      return chain();
    });

    const res = await POST(postReq(), slug());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.customer_id).toBe('cust-new');
  });

  // ── 2. Restaurant not found ───────────────────────────────────────────────
  it('returns 404 when restaurant slug is unknown', async () => {
    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') return restaurantChain;
      return chain();
    });

    const res = await POST(postReq(), slug());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Restaurant introuvable');
  });

  // ── 3. Duplicate email → 409 ──────────────────────────────────────────────
  it('returns 409 on duplicate email (Supabase 23505)', async () => {
    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: RESTAURANT.id, name: RESTAURANT.name, primary_color: RESTAURANT.primary_color },
        error: null,
      }),
    });

    // Rate-limit count check (first call to from('customers'))
    const rateLimitChain = chain();
    (rateLimitChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ count: 0 }).then(resolve);

    // Insert that returns duplicate error (second call)
    const insertChain = chain({
      single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    });

    let customersCallCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') return restaurantChain;
      if (table === 'customers') {
        customersCallCount++;
        return customersCallCount === 1 ? rateLimitChain : insertChain;
      }
      return chain();
    });

    const res = await POST(postReq(), slug());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('Email déjà inscrit');
  });

  // ── 4. Missing required fields → 400 ──────────────────────────────────────
  it('returns 400 when required fields are missing', async () => {
    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: RESTAURANT.id, name: RESTAURANT.name, primary_color: RESTAURANT.primary_color },
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') return restaurantChain;
      return chain();
    });

    // Missing first_name and email
    const res = await POST(postReq({}), slug());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeTruthy();
  });

  // ── 5. Invalid email → 400 ────────────────────────────────────────────────
  it('returns 400 when email is invalid', async () => {
    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: RESTAURANT.id, name: RESTAURANT.name, primary_color: RESTAURANT.primary_color },
        error: null,
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') return restaurantChain;
      return chain();
    });

    const res = await POST(
      postReq({ first_name: 'Bob', email: 'not-an-email' }),
      slug(),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('email');
  });
});
