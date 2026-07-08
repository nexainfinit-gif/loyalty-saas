/**
 * Tests for lib/plan-limits.ts — DB-backed plan limits (migration 035).
 *
 * The plans/plan_features tables are the single source of truth; the old
 * hardcoded PLAN_LIMITS (free/starter/pro) caused real 'growth' restaurants
 * to fall back to free limits (100 customers). These tests lock the new
 * behavior: DB values win, unknown plans fall back to restrictive limits,
 * NULL means unlimited.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, type FakeDb } from '../helpers/fake-db';

const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => dbHolder.db.from(table) },
}));

import { getPlanLimits, hasFeature, checkPlanLimit, checkEmailQuota, _clearPlanCache } from '@/lib/plan-limits';

const PLANS = [
  { id: 'plan-starter', key: 'starter', max_templates: 3, max_campaigns_per_month: 8, max_customers: 500, max_emails_per_month: 5000 },
  { id: 'plan-growth', key: 'growth', max_templates: 10, max_campaigns_per_month: 12, max_customers: 2000, max_emails_per_month: 25000 },
  { id: 'plan-pro', key: 'pro', max_templates: null, max_campaigns_per_month: 15, max_customers: 4000, max_emails_per_month: null },
];

const FEATURES = [
  { plan_id: 'plan-starter', feature_key: 'referral_program', enabled: true },
  { plan_id: 'plan-starter', feature_key: 'booking', enabled: false },
  { plan_id: 'plan-growth', feature_key: 'referral_program', enabled: true },
  { plan_id: 'plan-growth', feature_key: 'booking', enabled: true },
];

function seedDb(overrides: Record<string, Record<string, unknown>[]> = {}) {
  dbHolder.db = createFakeDb({
    plans: PLANS.map((p) => ({ ...p })),
    plan_features: FEATURES.map((f) => ({ ...f })),
    wallet_pass_templates: [],
    campaigns: [],
    customers: [],
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearPlanCache();
  seedDb();
});

describe('getPlanLimits (DB source of truth)', () => {
  it('reads growth limits from the DB — the bug that motivated migration 035', async () => {
    const limits = await getPlanLimits('growth');
    expect(limits).toEqual({ maxTemplates: 10, maxCampaignsPerMonth: 12, maxCustomers: 2000, maxEmailsPerMonth: 25000, includedRemindersPerMonth: -1 });
  });

  it('treats NULL columns as unlimited (-1)', async () => {
    const limits = await getPlanLimits('pro');
    expect(limits.maxTemplates).toBe(-1);
    expect(limits.maxCustomers).toBe(4000);
  });

  it('falls back to restrictive limits for an unknown plan key', async () => {
    const limits = await getPlanLimits('free'); // no longer exists in DB
    expect(limits).toEqual({ maxTemplates: 3, maxCampaignsPerMonth: 8, maxCustomers: 500, maxEmailsPerMonth: 5000, includedRemindersPerMonth: 100 });
  });

  it('falls back to restrictive limits when plan is null', async () => {
    const limits = await getPlanLimits(null);
    expect(limits.maxCustomers).toBe(500);
  });

  it('caches plans between calls (single DB round-trip)', async () => {
    await getPlanLimits('growth');
    // Mutate the underlying table — cached value must still be served
    dbHolder.db.rows('plans').find((p) => p.key === 'growth')!.max_customers = 9999;
    const limits = await getPlanLimits('growth');
    expect(limits.maxCustomers).toBe(2000); // still cached
  });
});

describe('hasFeature (plan_features table)', () => {
  it('returns true when the DB row says enabled', async () => {
    expect(await hasFeature('growth', 'booking')).toBe(true);
    expect(await hasFeature('starter', 'referral_program')).toBe(true);
  });

  it('returns false when disabled or missing', async () => {
    expect(await hasFeature('starter', 'booking')).toBe(false);
    expect(await hasFeature('pro', 'referral_program')).toBe(false); // no row seeded
    expect(await hasFeature('unknown-plan', 'booking')).toBe(false);
    expect(await hasFeature(null, 'booking')).toBe(false);
  });
});

describe('checkPlanLimit', () => {
  it('blocks when the customer count reaches the plan limit', async () => {
    seedDb({
      customers: Array.from({ length: 500 }, (_, i) => ({ id: `c-${i}`, restaurant_id: 'rest-001' })),
    });

    const res = await checkPlanLimit('rest-001', 'starter', 'customers');
    expect(res).toEqual({ allowed: false, limit: 500, current: 500 });
  });

  it('allows below the limit and only counts the requesting restaurant', async () => {
    seedDb({
      customers: [
        { id: 'c-1', restaurant_id: 'rest-001' },
        { id: 'c-2', restaurant_id: 'rest-OTHER' }, // must not count
      ],
    });

    const res = await checkPlanLimit('rest-001', 'starter', 'customers');
    expect(res).toEqual({ allowed: true, limit: 500, current: 1 });
  });

  it('always allows unlimited (-1) resources', async () => {
    seedDb({
      wallet_pass_templates: Array.from({ length: 50 }, (_, i) => ({ id: `t-${i}`, restaurant_id: 'rest-001' })),
    });

    const res = await checkPlanLimit('rest-001', 'pro', 'templates');
    expect(res.allowed).toBe(true);
    expect(res.limit).toBe(-1);
  });

  it('counts only current-month campaigns', async () => {
    const now = new Date().toISOString();
    seedDb({
      campaigns: [
        { id: 'camp-old', restaurant_id: 'rest-001', created_at: '2020-01-01T00:00:00Z' },
        { id: 'camp-new', restaurant_id: 'rest-001', created_at: now },
      ],
    });

    const res = await checkPlanLimit('rest-001', 'growth', 'campaigns');
    expect(res.current).toBe(1); // old campaign excluded
    expect(res.limit).toBe(12);
  });
});

describe('checkEmailQuota (migration 036 — marge 66 %)', () => {
  const now = new Date().toISOString();

  it('allows a campaign that stays within the monthly quota', async () => {
    seedDb({
      campaigns: [
        { id: 'c1', restaurant_id: 'rest-001', recipients_count: 3000, created_at: now },
      ],
    });

    const res = await checkEmailQuota('rest-001', 'starter', 1500);
    expect(res).toEqual({ allowed: true, limit: 5000, current: 3000 }); // 3000+1500 ≤ 5000
  });

  it('blocks a campaign that would exceed the quota', async () => {
    seedDb({
      campaigns: [
        { id: 'c1', restaurant_id: 'rest-001', recipients_count: 4000, created_at: now },
      ],
    });

    const res = await checkEmailQuota('rest-001', 'starter', 1500);
    expect(res.allowed).toBe(false); // 4000+1500 > 5000
    expect(res.current).toBe(4000);
  });

  it('ignores previous months and other restaurants', async () => {
    seedDb({
      campaigns: [
        { id: 'old', restaurant_id: 'rest-001', recipients_count: 99999, created_at: '2020-01-01T00:00:00Z' },
        { id: 'other', restaurant_id: 'rest-OTHER', recipients_count: 99999, created_at: now },
        { id: 'mine', restaurant_id: 'rest-001', recipients_count: 100, created_at: now },
      ],
    });

    const res = await checkEmailQuota('rest-001', 'starter', 100);
    expect(res).toEqual({ allowed: true, limit: 5000, current: 100 });
  });

  it('NULL quota = unlimited (pro)', async () => {
    seedDb({
      campaigns: [
        { id: 'c1', restaurant_id: 'rest-001', recipients_count: 999999, created_at: now },
      ],
    });

    const res = await checkEmailQuota('rest-001', 'pro', 500000);
    expect(res.allowed).toBe(true);
    expect(res.limit).toBe(-1);
  });

  it('unknown plan falls back to the restrictive quota (5000)', async () => {
    seedDb();
    const res = await checkEmailQuota('rest-001', 'plan-fantome', 6000);
    expect(res.allowed).toBe(false);
    expect(res.limit).toBe(5000);
  });
});
