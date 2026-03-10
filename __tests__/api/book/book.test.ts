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
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(undefined),
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

import { POST } from '@/app/api/book/[slug]/book/route';
import { sendBookingConfirmationEmail } from '@/lib/email';
import { buildRequest, buildParams } from '@/__tests__/helpers/request';
import { RESTAURANT, SERVICE, STAFF, APPOINTMENT_SETTINGS } from '@/__tests__/helpers/fixtures';

// ---------------------------------------------------------------------------
// Helpers
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

// Zod expects real UUIDs for serviceId/staffId
const UUID_SERVICE = '00000000-0000-4000-8000-000000000001';
const UUID_STAFF   = '00000000-0000-4000-8000-000000000002';

const VALID_BODY = {
  serviceId: UUID_SERVICE,
  staffId: UUID_STAFF,
  date: '2026-03-15',
  time: '10:00',
  clientName: 'Bob Client',
  clientEmail: 'bob@example.com',
  clientPhone: '+33612345678',
  notes: null,
};

function slug() {
  return buildParams({ slug: 'chez-test' });
}

function postReq(body: unknown = VALID_BODY) {
  return buildRequest('/api/book/chez-test/book', { method: 'POST', body });
}

/**
 * Creates a chainable mock that is also a thenable (so `await chain` resolves).
 * This is needed because Supabase queries like `.select().eq().gt()` are
 * awaited directly (without calling `.single()`).
 */
function awaitableChain(resolvedValue: { data: unknown; error: unknown }, overrides: Record<string, unknown> = {}) {
  const c = chain(overrides);
  // Make every chaining method return c (already done by chain())
  // Add .then so the chain itself can be awaited
  (c as Record<string, unknown>).then = (resolve: (v: unknown) => void) => Promise.resolve(resolvedValue).then(resolve);
  return c;
}

/**
 * Configures mockFrom for the happy path.
 * Returns per-table chains so individual tests can override specific behaviour.
 */
function setupHappyPath() {
  const restaurantChain = chain({
    single: vi.fn().mockResolvedValue({
      data: { id: RESTAURANT.id, name: RESTAURANT.name, slug: RESTAURANT.slug, primary_color: RESTAURANT.primary_color },
      error: null,
    }),
  });

  const serviceChain = chain({
    single: vi.fn().mockResolvedValue({
      data: { id: SERVICE.id, name: SERVICE.name, duration_minutes: SERVICE.duration_minutes, price: SERVICE.price },
      error: null,
    }),
  });

  const staffChain = chain({
    single: vi.fn().mockResolvedValue({
      data: { id: STAFF.id, name: STAFF.name, service_ids: [UUID_SERVICE, 'svc-002'] },
      error: null,
    }),
  });

  // Conflict check: awaitable chain resolving to no conflicts
  const appointmentsSelectChain = awaitableChain({ data: [], error: null });

  // Insert chain for creating the appointment
  const appointmentsInsertChain = chain({
    single: vi.fn().mockResolvedValue({
      data: { id: 'apt-new' },
      error: null,
    }),
  });

  // Track call count to appointments to differentiate conflict-check vs insert
  let appointmentsCallCount = 0;
  const appointmentsHandler = () => {
    appointmentsCallCount++;
    if (appointmentsCallCount === 1) return appointmentsSelectChain; // conflict check
    return appointmentsInsertChain; // insert
  };

  const noShowChain = chain({
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  const settingsChain = chain({
    single: vi.fn().mockResolvedValue({
      data: { confirmation_message: APPOINTMENT_SETTINGS.confirmation_message },
      error: null,
    }),
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'restaurants') return restaurantChain;
    if (table === 'services') return serviceChain;
    if (table === 'staff_members') return staffChain;
    if (table === 'appointments') return appointmentsHandler();
    if (table === 'client_no_show_stats') return noShowChain;
    if (table === 'appointment_settings') return settingsChain;
    return chain();
  });

  return {
    restaurantChain,
    serviceChain,
    staffChain,
    appointmentsSelectChain,
    appointmentsInsertChain,
    noShowChain,
    settingsChain,
    resetAppointmentsCount: () => { appointmentsCallCount = 0; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/book/[slug]/book', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────────
  it('returns 200 and creates appointment on valid input', async () => {
    setupHappyPath();

    const res = await POST(postReq(), slug());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.appointmentId).toBe('apt-new');
    expect(json.serviceName).toBe(SERVICE.name);
    expect(json.staffName).toBe(STAFF.name);
    expect(json.date).toBe('2026-03-15');
    expect(json.startTime).toBe('10:00');
    expect(json.endTime).toBe('10:30');
    expect(sendBookingConfirmationEmail).toHaveBeenCalled();
  });

  // ── 2. Restaurant not found → 404 ────────────────────────────────────────
  it('returns 404 when restaurant slug does not exist', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') {
        return chain({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        });
      }
      return chain();
    });

    const res = await POST(postReq(), slug());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toContain('introuvable');
  });

  // ── 3. Service inactive → 400 ────────────────────────────────────────────
  it('returns 400 when service is not found or inactive', async () => {
    const mocks = setupHappyPath();
    // Override service to return null (inactive/not found)
    (mocks.serviceChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await POST(postReq(), slug());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Service');
  });

  // ── 4. Staff doesn't offer service → 400 ─────────────────────────────────
  it('returns 400 when staff does not offer the requested service', async () => {
    const mocks = setupHappyPath();
    // Override staff to have empty service_ids (does not offer the service)
    (mocks.staffChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: STAFF.id, name: STAFF.name, service_ids: ['svc-999'] },
      error: null,
    });

    const res = await POST(postReq(), slug());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('ne propose pas');
  });

  // ── 5. Double-booking conflict → 409 ─────────────────────────────────────
  it('returns 409 when there is a scheduling conflict', async () => {
    // Build a fresh happy path but override the conflict check to return a conflict
    const restaurantChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: RESTAURANT.id, name: RESTAURANT.name, slug: RESTAURANT.slug, primary_color: RESTAURANT.primary_color },
        error: null,
      }),
    });
    const serviceChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: SERVICE.id, name: SERVICE.name, duration_minutes: SERVICE.duration_minutes, price: SERVICE.price },
        error: null,
      }),
    });
    const staffChain = chain({
      single: vi.fn().mockResolvedValue({
        data: { id: STAFF.id, name: STAFF.name, service_ids: [UUID_SERVICE] },
        error: null,
      }),
    });
    // Conflict check returns existing appointment
    const conflictChain = awaitableChain({ data: [{ id: 'apt-existing' }], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurants') return restaurantChain;
      if (table === 'services') return serviceChain;
      if (table === 'staff_members') return staffChain;
      if (table === 'appointments') return conflictChain;
      return chain();
    });

    const res = await POST(postReq(), slug());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toContain('plus disponible');
  });

  // ── 6. Invalid input (bad date format) → 400 ─────────────────────────────
  it('returns 400 on invalid input (bad date format)', async () => {
    // No need for Supabase mocks — Zod validation fails first
    mockFrom.mockImplementation(() => chain());

    const res = await POST(
      postReq({ ...VALID_BODY, date: 'not-a-date' }),
      slug(),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeTruthy();
  });
});
