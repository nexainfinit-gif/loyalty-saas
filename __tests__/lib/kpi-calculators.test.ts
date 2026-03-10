/**
 * Unit tests for KPI calculator pure functions.
 *
 * Every calculator in lib/kpi-calculators.ts is a pure function that takes
 * a MetricsSnapshot (and optionally settings) and returns a KpiResult.
 * No DB, no network — just math.
 */

import {
  calculateTotalCustomers,
  calculateNewCustomers30d,
  calculateActiveCustomers30d,
  calculateChurnRate,
  calculateRetentionRate,
  calculateRewardsIssued,
  calculateScansPerCustomer,
  calculateAvgDaysBetweenVisits,
  calculateRevenueEstimate,
  calculateLtvEstimate,
} from '@/lib/kpi-calculators';

/* ── Snapshot helper ──────────────────────────────────────────────────────── */

/**
 * Returns a MetricsSnapshot with sensible defaults.
 * Each test only overrides the fields it cares about.
 */
function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    totalCustomers:       100,
    newCustomers30d:      20,
    newCustomersPrev30d:  10,
    activeCustomers30d:   60,
    activePrev30d:        50,
    activeCustomers90d:   80,
    inactiveCustomers30d: 40,
    retainedCustomers90d: 55,
    totalScans:           500,
    scans30d:             120,
    scansPrev30d:         100,
    rewardsIssued:        15,
    rewardsIssued30d:     5,
    walletPassCount:      30,
    campaignReach:        200,
    avgDaysBetweenVisits: 10 as number | null,
    ...overrides,
  };
}

/* ── 1. calculateTotalCustomers ───────────────────────────────────────────── */

describe('calculateTotalCustomers', () => {
  it('returns the totalCustomers value', () => {
    const r = calculateTotalCustomers(makeSnapshot({ totalCustomers: 250 }));
    expect(r.value).toBe(250);
  });

  it('computes trend from new customers current vs previous period', () => {
    // 20 new this period, 10 previous → +100%
    const r = calculateTotalCustomers(makeSnapshot());
    expect(r.trend).toBe(100);
  });

  it('returns undefined trend when previous period is 0', () => {
    const r = calculateTotalCustomers(makeSnapshot({ newCustomersPrev30d: 0 }));
    expect(r.trend).toBeUndefined();
  });

  it('status is critical when 0 customers', () => {
    const r = calculateTotalCustomers(makeSnapshot({ totalCustomers: 0 }));
    expect(r.status).toBe('critical');
  });

  it('status is warning when < 10 customers', () => {
    const r = calculateTotalCustomers(makeSnapshot({ totalCustomers: 5 }));
    expect(r.status).toBe('warning');
  });

  it('status is good when >= 10 customers', () => {
    const r = calculateTotalCustomers(makeSnapshot({ totalCustomers: 10 }));
    expect(r.status).toBe('good');
  });
});

/* ── 2. calculateNewCustomers30d ──────────────────────────────────────────── */

describe('calculateNewCustomers30d', () => {
  it('returns the newCustomers30d value', () => {
    const r = calculateNewCustomers30d(makeSnapshot({ newCustomers30d: 42 }));
    expect(r.value).toBe(42);
  });

  it('calculates trend from previous period', () => {
    // 20 current, 10 previous → +100%
    const r = calculateNewCustomers30d(makeSnapshot());
    expect(r.trend).toBe(100);
  });

  it('trend is negative when fewer new customers than previous period', () => {
    const r = calculateNewCustomers30d(
      makeSnapshot({ newCustomers30d: 5, newCustomersPrev30d: 10 }),
    );
    expect(r.trend).toBe(-50);
  });

  it('status is critical when 0 new customers', () => {
    const r = calculateNewCustomers30d(makeSnapshot({ newCustomers30d: 0 }));
    expect(r.status).toBe('critical');
  });

  it('status is warning when < 5 new customers', () => {
    const r = calculateNewCustomers30d(makeSnapshot({ newCustomers30d: 3 }));
    expect(r.status).toBe('warning');
  });

  it('status is good when >= 5 new customers', () => {
    const r = calculateNewCustomers30d(makeSnapshot({ newCustomers30d: 5 }));
    expect(r.status).toBe('good');
  });
});

/* ── 3. calculateActiveCustomers30d ───────────────────────────────────────── */

describe('calculateActiveCustomers30d', () => {
  it('returns the activeCustomers30d value', () => {
    const r = calculateActiveCustomers30d(makeSnapshot({ activeCustomers30d: 75 }));
    expect(r.value).toBe(75);
  });

  it('calculates trend from previous 30d active count', () => {
    // 60 current, 50 previous → +20%
    const r = calculateActiveCustomers30d(makeSnapshot());
    expect(r.trend).toBe(20);
  });

  it('status is good when active rate >= 40%', () => {
    // 60/100 = 60% → good
    const r = calculateActiveCustomers30d(makeSnapshot());
    expect(r.status).toBe('good');
  });

  it('status is warning when active rate >= 20% but < 40%', () => {
    // 25/100 = 25% → warning
    const r = calculateActiveCustomers30d(
      makeSnapshot({ activeCustomers30d: 25 }),
    );
    expect(r.status).toBe('warning');
  });

  it('status is critical when active rate < 20%', () => {
    // 10/100 = 10% → critical
    const r = calculateActiveCustomers30d(
      makeSnapshot({ activeCustomers30d: 10 }),
    );
    expect(r.status).toBe('critical');
  });

  it('status is critical when totalCustomers is 0 (rate is 0)', () => {
    const r = calculateActiveCustomers30d(
      makeSnapshot({ totalCustomers: 0, activeCustomers30d: 0 }),
    );
    expect(r.status).toBe('critical');
  });
});

/* ── 4. calculateChurnRate ────────────────────────────────────────────────── */

describe('calculateChurnRate', () => {
  it('computes churn = inactive / total * 100', () => {
    // 40 inactive, 100 total → 40%
    const r = calculateChurnRate(makeSnapshot());
    expect(r.value).toBe(40);
  });

  it('returns 0 when totalCustomers is 0 (no division by zero)', () => {
    const r = calculateChurnRate(
      makeSnapshot({ totalCustomers: 0, inactiveCustomers30d: 0 }),
    );
    expect(r.value).toBe(0);
  });

  it('status is good when churn < 20%', () => {
    // 10 inactive, 100 total → 10%
    const r = calculateChurnRate(
      makeSnapshot({ inactiveCustomers30d: 10 }),
    );
    expect(r.status).toBe('good');
  });

  it('status is warning when churn >= 20% and < 50%', () => {
    // 40 inactive, 100 total → 40%
    const r = calculateChurnRate(makeSnapshot());
    expect(r.status).toBe('warning');
  });

  it('status is critical when churn >= 50%', () => {
    // 60 inactive, 100 total → 60%
    const r = calculateChurnRate(
      makeSnapshot({ inactiveCustomers30d: 60 }),
    );
    expect(r.status).toBe('critical');
  });

  it('churn is exactly 50% — should be critical', () => {
    const r = calculateChurnRate(
      makeSnapshot({ inactiveCustomers30d: 50 }),
    );
    expect(r.value).toBe(50);
    expect(r.status).toBe('critical');
  });

  it('churn is exactly 20% — should be warning (not good)', () => {
    const r = calculateChurnRate(
      makeSnapshot({ inactiveCustomers30d: 20 }),
    );
    expect(r.value).toBe(20);
    expect(r.status).toBe('warning');
  });
});

/* ── 5. calculateRetentionRate ────────────────────────────────────────────── */

describe('calculateRetentionRate', () => {
  it('computes retention = retained / total * 100', () => {
    // 55 retained, 100 total → 55%
    const r = calculateRetentionRate(makeSnapshot());
    expect(r.value).toBe(55);
  });

  it('returns 0 when totalCustomers is 0', () => {
    const r = calculateRetentionRate(
      makeSnapshot({ totalCustomers: 0, retainedCustomers90d: 0 }),
    );
    expect(r.value).toBe(0);
  });

  it('status is good when retention >= 70%', () => {
    const r = calculateRetentionRate(
      makeSnapshot({ retainedCustomers90d: 75 }),
    );
    expect(r.status).toBe('good');
  });

  it('status is warning when retention >= 40% but < 70%', () => {
    // 55/100 = 55%
    const r = calculateRetentionRate(makeSnapshot());
    expect(r.status).toBe('warning');
  });

  it('status is critical when retention < 40%', () => {
    const r = calculateRetentionRate(
      makeSnapshot({ retainedCustomers90d: 30 }),
    );
    expect(r.status).toBe('critical');
  });

  it('retention exactly 70% — should be good', () => {
    const r = calculateRetentionRate(
      makeSnapshot({ retainedCustomers90d: 70 }),
    );
    expect(r.value).toBe(70);
    expect(r.status).toBe('good');
  });

  it('retention exactly 40% — should be warning', () => {
    const r = calculateRetentionRate(
      makeSnapshot({ retainedCustomers90d: 40 }),
    );
    expect(r.value).toBe(40);
    expect(r.status).toBe('warning');
  });
});

/* ── 6. calculateRewardsIssued ────────────────────────────────────────────── */

describe('calculateRewardsIssued', () => {
  it('returns the rewardsIssued count', () => {
    const r = calculateRewardsIssued(makeSnapshot({ rewardsIssued: 42 }));
    expect(r.value).toBe(42);
  });

  it('trend is always undefined (previous is hardcoded to 0)', () => {
    const r = calculateRewardsIssued(makeSnapshot());
    expect(r.trend).toBeUndefined();
  });

  it('status is always good', () => {
    const r = calculateRewardsIssued(makeSnapshot({ rewardsIssued: 0 }));
    expect(r.status).toBe('good');
  });
});

/* ── 7. calculateScansPerCustomer ─────────────────────────────────────────── */

describe('calculateScansPerCustomer', () => {
  it('computes scans30d / activeCustomers30d', () => {
    // 120 scans / 60 active = 2.0
    const r = calculateScansPerCustomer(makeSnapshot());
    expect(r.value).toBe(2);
  });

  it('returns 0 when activeCustomers30d is 0 (no division by zero)', () => {
    const r = calculateScansPerCustomer(
      makeSnapshot({ activeCustomers30d: 0 }),
    );
    expect(r.value).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    // 10 scans / 3 active = 3.333... → 3.33
    const r = calculateScansPerCustomer(
      makeSnapshot({ scans30d: 10, activeCustomers30d: 3 }),
    );
    expect(r.value).toBe(3.33);
  });

  it('status is good when ratio >= 3', () => {
    const r = calculateScansPerCustomer(
      makeSnapshot({ scans30d: 30, activeCustomers30d: 10 }),
    );
    expect(r.status).toBe('good');
  });

  it('status is warning when ratio >= 1 but < 3', () => {
    const r = calculateScansPerCustomer(makeSnapshot());
    expect(r.status).toBe('warning');
  });

  it('status is critical when ratio < 1', () => {
    const r = calculateScansPerCustomer(
      makeSnapshot({ scans30d: 5, activeCustomers30d: 10 }),
    );
    expect(r.status).toBe('critical');
  });

  it('status is critical when ratio is 0 (no active customers)', () => {
    const r = calculateScansPerCustomer(
      makeSnapshot({ activeCustomers30d: 0 }),
    );
    expect(r.status).toBe('critical');
  });
});

/* ── 8. calculateAvgDaysBetweenVisits ─────────────────────────────────────── */

describe('calculateAvgDaysBetweenVisits', () => {
  it('returns rounded value when data is available', () => {
    const r = calculateAvgDaysBetweenVisits(
      makeSnapshot({ avgDaysBetweenVisits: 7.456 }),
    );
    expect(r.value).toBe(7.46);
  });

  it('returns 0 with warning status when avgDaysBetweenVisits is null', () => {
    const r = calculateAvgDaysBetweenVisits(
      makeSnapshot({ avgDaysBetweenVisits: null }),
    );
    expect(r.value).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('status is good when <= 14 days', () => {
    const r = calculateAvgDaysBetweenVisits(
      makeSnapshot({ avgDaysBetweenVisits: 14 }),
    );
    expect(r.status).toBe('good');
  });

  it('status is warning when > 14 and <= 30 days', () => {
    const r = calculateAvgDaysBetweenVisits(
      makeSnapshot({ avgDaysBetweenVisits: 20 }),
    );
    expect(r.status).toBe('warning');
  });

  it('status is critical when > 30 days', () => {
    const r = calculateAvgDaysBetweenVisits(
      makeSnapshot({ avgDaysBetweenVisits: 45 }),
    );
    expect(r.status).toBe('critical');
  });
});

/* ── 9. calculateRevenueEstimate ──────────────────────────────────────────── */

describe('calculateRevenueEstimate', () => {
  it('computes scans30d * average_ticket', () => {
    const r = calculateRevenueEstimate(
      makeSnapshot({ scans30d: 100 }),
      { average_ticket: '25' },
    );
    expect(r.value).toBe(2500);
  });

  it('returns 0 with warning when average_ticket is missing', () => {
    const r = calculateRevenueEstimate(makeSnapshot(), {});
    expect(r.value).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('returns 0 with warning when average_ticket is 0', () => {
    const r = calculateRevenueEstimate(makeSnapshot(), { average_ticket: '0' });
    expect(r.value).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('returns 0 with warning when average_ticket is negative', () => {
    const r = calculateRevenueEstimate(makeSnapshot(), { average_ticket: '-10' });
    expect(r.value).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('calculates trend from scans current vs previous period', () => {
    // scans30d=120, scansPrev30d=100 → +20%
    const r = calculateRevenueEstimate(makeSnapshot(), { average_ticket: '10' });
    expect(r.trend).toBe(20);
  });

  it('rounds to 2 decimal places', () => {
    const r = calculateRevenueEstimate(
      makeSnapshot({ scans30d: 7 }),
      { average_ticket: '3.33' },
    );
    expect(r.value).toBe(23.31);
  });
});

/* ── 10. calculateLtvEstimate ─────────────────────────────────────────────── */

describe('calculateLtvEstimate', () => {
  it('computes ticket * (365 / avgDays)', () => {
    // ticket=20, avgDays=10 → 20 * 36.5 = 730
    const r = calculateLtvEstimate(
      makeSnapshot({ avgDaysBetweenVisits: 10 }),
      { average_ticket: '20' },
    );
    expect(r.value).toBe(730);
    expect(r.status).toBe('good');
  });

  it('returns 0 with warning when average_ticket is missing', () => {
    const r = calculateLtvEstimate(makeSnapshot(), {});
    expect(r.value).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('returns 0 with warning when average_ticket is 0', () => {
    const r = calculateLtvEstimate(makeSnapshot(), { average_ticket: '0' });
    expect(r.value).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('returns 0 with warning when avgDaysBetweenVisits is null', () => {
    const r = calculateLtvEstimate(
      makeSnapshot({ avgDaysBetweenVisits: null }),
      { average_ticket: '20' },
    );
    expect(r.value).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('returns 0 with warning when avgDaysBetweenVisits is 0', () => {
    const r = calculateLtvEstimate(
      makeSnapshot({ avgDaysBetweenVisits: 0 }),
      { average_ticket: '20' },
    );
    expect(r.value).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('rounds to 2 decimal places', () => {
    // ticket=15, avgDays=7 → 15 * 52.142857... = 782.142857... → 782.14
    const r = calculateLtvEstimate(
      makeSnapshot({ avgDaysBetweenVisits: 7 }),
      { average_ticket: '15' },
    );
    expect(r.value).toBe(782.14);
  });

  it('handles very frequent visitors (avgDays=1)', () => {
    // ticket=10, avgDays=1 → 10 * 365 = 3650
    const r = calculateLtvEstimate(
      makeSnapshot({ avgDaysBetweenVisits: 1 }),
      { average_ticket: '10' },
    );
    expect(r.value).toBe(3650);
  });
});
