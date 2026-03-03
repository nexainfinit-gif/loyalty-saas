/**
 * KPI Calculation Layer
 *
 * Architecture:
 *   1. loadMetrics()           — single bulk load, ~15 parallel COUNT queries
 *   2. Individual calculators  — pure functions, receive MetricsSnapshot + settings
 *   3. computeRestaurantKPIs() — orchestrator: resolves access → loads metrics → runs calculators
 *
 * Design rules:
 *   - No calculator queries the DB directly; all data comes from MetricsSnapshot
 *   - No UI changes. No cron jobs. Pure computation layer.
 *   - Calculators never throw — errors return { value: 0, status: 'warning' }
 *   - trend is % change vs previous 30-day window (undefined when prior period has no data)
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getRestaurantKPIs } from '@/lib/kpi-engine';

/* ── Output types ───────────────────────────────────────────────────────────── */

export interface KpiResult {
  /** The computed numeric value */
  value: number;
  /** % change vs previous 30-day window. Positive = improvement. undefined = no prior data */
  trend?: number;
  status?: 'good' | 'warning' | 'critical';
}

export interface ComputedKpi {
  key:      string;
  name:     string;
  category: string;
  result:   KpiResult;
}

/* ── Internal: bulk metrics snapshot ───────────────────────────────────────── */

interface MetricsSnapshot {
  // Customers
  totalCustomers:       number;
  newCustomers30d:      number;
  newCustomersPrev30d:  number;  // 31–60d window
  activeCustomers30d:   number;  // last_visit_at >= now-30d
  activePrev30d:        number;  // last_visit_at in 31–60d window
  activeCustomers90d:   number;
  inactiveCustomers30d: number;  // totalCustomers − activeCustomers30d
  retainedCustomers90d: number;  // total_visits >= 2 AND last_visit_at >= now-90d

  // Transactions
  totalScans:      number;
  scans30d:        number;
  scansPrev30d:    number;  // 31–60d window
  rewardsIssued:   number;  // stamps_delta < 0 (stamp card completions)
  rewardsIssued30d:number;

  // Wallet
  walletPassCount: number;  // active passes

  // Campaigns
  campaignReach: number;  // sum of recipients_count on sent campaigns

  // Visit frequency (approximate, computed from customers table)
  avgDaysBetweenVisits: number | null;
}

async function loadMetrics(restaurantId: string): Promise<MetricsSnapshot> {
  const now  = Date.now();
  const d30  = new Date(now - 30 * 86400_000).toISOString();
  const d60  = new Date(now - 60 * 86400_000).toISOString();
  const d90  = new Date(now - 90 * 86400_000).toISOString();

  const [
    { count: totalCustomers },
    { count: newCustomers30d },
    { count: newCustomersPrev30d },
    { count: activeCustomers30d },
    { count: activePrev30d },
    { count: activeCustomers90d },
    { count: retainedCustomers90d },
    { count: totalScans },
    { count: scans30d },
    { count: scansPrev30d },
    { count: rewardsIssued },
    { count: rewardsIssued30d },
    { count: walletPassCount },
    { data: campaignRows },
    { data: visitRows },
  ] = await Promise.all([
    // Total customers
    supabaseAdmin.from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId),

    // New customers — last 30d
    supabaseAdmin.from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', d30),

    // New customers — previous 30d (31–60d)
    supabaseAdmin.from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', d60)
      .lt('created_at', d30),

    // Active — last 30d
    supabaseAdmin.from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('last_visit_at', d30),

    // Active — previous 30d window
    supabaseAdmin.from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('last_visit_at', d60)
      .lt('last_visit_at', d30),

    // Active — last 90d
    supabaseAdmin.from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('last_visit_at', d90),

    // Retained — 2+ visits AND active in 90d
    supabaseAdmin.from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('last_visit_at', d90)
      .gte('total_visits', 2),

    // Total scans (all time)
    supabaseAdmin.from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId),

    // Scans — last 30d
    supabaseAdmin.from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', d30),

    // Scans — previous 30d window
    supabaseAdmin.from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', d60)
      .lt('created_at', d30),

    // Rewards issued (all time): stamp completions have stamps_delta < 0
    supabaseAdmin.from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .lt('stamps_delta', 0),

    // Rewards issued — last 30d
    supabaseAdmin.from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .lt('stamps_delta', 0)
      .gte('created_at', d30),

    // Active wallet passes
    supabaseAdmin.from('wallet_passes')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active'),

    // Campaign reach: sum recipients_count of sent campaigns
    supabaseAdmin.from('campaigns')
      .select('recipients_count')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'sent'),

    // Visit frequency source: customers with 2+ visits (capped at 1000 rows)
    supabaseAdmin.from('customers')
      .select('total_visits, created_at, last_visit_at')
      .eq('restaurant_id', restaurantId)
      .gte('total_visits', 2)
      .limit(1000),
  ]);

  // Campaign reach = sum of all sent recipients
  const campaignReach = (campaignRows ?? [])
    .reduce((sum, c) => sum + (c.recipients_count ?? 0), 0);

  // Avg days between visits — approximate from (last_visit_at − created_at) / (visits − 1)
  // This is the mean inter-visit gap, not the exact gap between consecutive visits.
  let avgDaysBetweenVisits: number | null = null;
  const gaps = (visitRows ?? [])
    .filter((c) => c.total_visits >= 2 && c.last_visit_at && c.created_at)
    .map((c) => {
      const spanDays = (new Date(c.last_visit_at).getTime() - new Date(c.created_at).getTime()) / 86400_000;
      return spanDays / (c.total_visits - 1);
    })
    .filter((g) => g > 0 && g < 365); // sanity: discard outliers > 1 year

  if (gaps.length > 0) {
    avgDaysBetweenVisits = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }

  const tc = totalCustomers ?? 0;
  const ac = activeCustomers30d ?? 0;

  return {
    totalCustomers:       tc,
    newCustomers30d:      newCustomers30d      ?? 0,
    newCustomersPrev30d:  newCustomersPrev30d  ?? 0,
    activeCustomers30d:   ac,
    activePrev30d:        activePrev30d        ?? 0,
    activeCustomers90d:   activeCustomers90d   ?? 0,
    inactiveCustomers30d: tc - ac,
    retainedCustomers90d: retainedCustomers90d ?? 0,
    totalScans:           totalScans           ?? 0,
    scans30d:             scans30d             ?? 0,
    scansPrev30d:         scansPrev30d         ?? 0,
    rewardsIssued:        rewardsIssued        ?? 0,
    rewardsIssued30d:     rewardsIssued30d     ?? 0,
    walletPassCount:      walletPassCount      ?? 0,
    campaignReach,
    avgDaysBetweenVisits,
  };
}

/* ── Utility helpers ────────────────────────────────────────────────────────── */

/** Percentage, rounded to 1 decimal. Returns 0 when total is 0. */
function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

/** % change between current and previous. undefined when previous = 0. */
function trend(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Round to 2 decimal places. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ── Individual calculators (pure functions) ────────────────────────────────── */

export function calculateTotalCustomers(m: MetricsSnapshot): KpiResult {
  return {
    value:  m.totalCustomers,
    trend:  trend(m.newCustomers30d, m.newCustomersPrev30d),
    status: m.totalCustomers === 0 ? 'critical' : m.totalCustomers < 10 ? 'warning' : 'good',
  };
}

export function calculateNewCustomers30d(m: MetricsSnapshot): KpiResult {
  return {
    value:  m.newCustomers30d,
    trend:  trend(m.newCustomers30d, m.newCustomersPrev30d),
    status: m.newCustomers30d === 0 ? 'critical' : m.newCustomers30d < 5 ? 'warning' : 'good',
  };
}

export function calculateActiveCustomers30d(m: MetricsSnapshot): KpiResult {
  const rate = pct(m.activeCustomers30d, m.totalCustomers);
  return {
    value:  m.activeCustomers30d,
    trend:  trend(m.activeCustomers30d, m.activePrev30d),
    status: rate >= 40 ? 'good' : rate >= 20 ? 'warning' : 'critical',
  };
}

/** Churn rate = % of total customers inactive in last 30d */
export function calculateChurnRate(m: MetricsSnapshot): KpiResult {
  const rate = pct(m.inactiveCustomers30d, m.totalCustomers);
  return {
    value:  r2(rate),
    // No previous-period churn rate available without historical snapshots
    status: rate < 20 ? 'good' : rate < 50 ? 'warning' : 'critical',
  };
}

/** Retention = % of customers with 2+ visits in last 90d */
export function calculateRetentionRate(m: MetricsSnapshot): KpiResult {
  const rate = pct(m.retainedCustomers90d, m.totalCustomers);
  return {
    value:  r2(rate),
    status: rate >= 70 ? 'good' : rate >= 40 ? 'warning' : 'critical',
  };
}

export function calculateTotalScans(m: MetricsSnapshot): KpiResult {
  return {
    value:  m.totalScans,
    trend:  trend(m.scans30d, m.scansPrev30d),
    status: m.totalScans === 0 ? 'critical' : 'good',
  };
}

/** Scans per active customer in last 30d */
export function calculateScansPerCustomer(m: MetricsSnapshot): KpiResult {
  const ratio = m.activeCustomers30d > 0
    ? r2(m.scans30d / m.activeCustomers30d)
    : 0;
  return {
    value:  ratio,
    status: ratio >= 3 ? 'good' : ratio >= 1 ? 'warning' : 'critical',
  };
}

/** Stamp card completions (stamps_delta < 0) */
export function calculateRewardsIssued(m: MetricsSnapshot): KpiResult {
  return {
    value:  m.rewardsIssued,
    trend:  trend(m.rewardsIssued30d, 0),
    status: 'good',
  };
}

/**
 * Average days between consecutive visits, approximated from
 * (last_visit_at − created_at) / (total_visits − 1) per customer.
 * Lower = more frequent = better.
 */
export function calculateAvgDaysBetweenVisits(m: MetricsSnapshot): KpiResult {
  if (m.avgDaysBetweenVisits === null) {
    return { value: 0, status: 'warning' };
  }
  const val = r2(m.avgDaysBetweenVisits);
  return {
    value:  val,
    status: val <= 14 ? 'good' : val <= 30 ? 'warning' : 'critical',
  };
}

/** Active wallet passes / total customers */
export function calculateWalletPassRate(m: MetricsSnapshot): KpiResult {
  const rate = pct(m.walletPassCount, m.totalCustomers);
  return {
    value:  r2(rate),
    status: rate >= 50 ? 'good' : rate >= 20 ? 'warning' : 'critical',
  };
}

/** Estimated revenue = scans (30d) × average_ticket setting */
export function calculateRevenueEstimate(
  m: MetricsSnapshot,
  settings: Record<string, string>,
): KpiResult {
  const ticket = parseFloat(settings['average_ticket'] ?? '0');
  if (ticket <= 0) return { value: 0, status: 'warning' };
  return {
    value:  r2(m.scans30d * ticket),
    trend:  trend(m.scans30d, m.scansPrev30d),
    status: 'good',
  };
}

/** Revenue estimate / active customers */
export function calculateRevenuePerCustomer(
  m: MetricsSnapshot,
  settings: Record<string, string>,
): KpiResult {
  const ticket = parseFloat(settings['average_ticket'] ?? '0');
  if (ticket <= 0 || m.activeCustomers30d === 0) return { value: 0, status: 'warning' };
  return {
    value:  r2((m.scans30d * ticket) / m.activeCustomers30d),
    status: 'good',
  };
}

/** Mirrors the restaurant_settings value — no computation needed */
export function calculateAvgTicket(settings: Record<string, string>): KpiResult {
  const val = parseFloat(settings['average_ticket'] ?? '0');
  return {
    value:  r2(val),
    status: val > 0 ? 'good' : 'warning',
  };
}

/**
 * LTV estimate = average_ticket × visits_per_year
 * visits_per_year = 365 / avgDaysBetweenVisits
 * Assumes 1-year horizon (conservative default).
 */
export function calculateLtvEstimate(
  m: MetricsSnapshot,
  settings: Record<string, string>,
): KpiResult {
  const ticket = parseFloat(settings['average_ticket'] ?? '0');
  if (ticket <= 0 || !m.avgDaysBetweenVisits || m.avgDaysBetweenVisits <= 0) {
    return { value: 0, status: 'warning' };
  }
  const visitsPerYear = 365 / m.avgDaysBetweenVisits;
  return {
    value:  r2(ticket * visitsPerYear),
    status: 'good',
  };
}

/** Total unique recipients touched by sent email campaigns */
export function calculateCampaignReach(m: MetricsSnapshot): KpiResult {
  const rate = pct(m.campaignReach, m.totalCustomers);
  return {
    value:  m.campaignReach,
    status: rate >= 50 ? 'good' : rate >= 20 ? 'warning' : 'critical',
  };
}

/* ── Calculator registry ────────────────────────────────────────────────────── */

type CalculatorFn = (
  m: MetricsSnapshot,
  settings: Record<string, string>,
) => KpiResult;

const CALCULATORS: Record<string, CalculatorFn> = {
  total_customers:          (m)    => calculateTotalCustomers(m),
  new_customers_30d:        (m)    => calculateNewCustomers30d(m),
  active_customers_30d:     (m)    => calculateActiveCustomers30d(m),
  churn_rate_30d:           (m)    => calculateChurnRate(m),
  retention_rate_90d:       (m)    => calculateRetentionRate(m),
  total_scans:              (m)    => calculateTotalScans(m),
  scans_per_customer:       (m)    => calculateScansPerCustomer(m),
  rewards_issued:           (m)    => calculateRewardsIssued(m),
  avg_days_between_visits:  (m)    => calculateAvgDaysBetweenVisits(m),
  wallet_pass_rate:         (m)    => calculateWalletPassRate(m),
  revenue_estimate:         (m, s) => calculateRevenueEstimate(m, s),
  revenue_per_customer:     (m, s) => calculateRevenuePerCustomer(m, s),
  avg_ticket:               (_m, s)=> calculateAvgTicket(s),
  ltv_estimate:             (m, s) => calculateLtvEstimate(m, s),
  campaign_reach:           (m)    => calculateCampaignReach(m),
};

/* ── Orchestrator ───────────────────────────────────────────────────────────── */

/**
 * computeRestaurantKPIs(restaurantId)
 *
 * 1. Resolves which KPIs are enabled for this restaurant's plan (via kpi-engine)
 * 2. Loads a single MetricsSnapshot (all counts in parallel)
 * 3. Runs only the enabled calculators
 * 4. Returns merged results — one ComputedKpi per enabled KPI that has a calculator
 */
export async function computeRestaurantKPIs(restaurantId: string): Promise<ComputedKpi[]> {
  // Step 1 — resolve access + settings
  const { kpis: resolved, settings } = await getRestaurantKPIs(restaurantId);
  const enabled = resolved.filter((r) => r.enabled);
  if (enabled.length === 0) return [];

  // Step 2 — load all raw metrics in one bulk call
  const metrics = await loadMetrics(restaurantId);

  // Step 3 — run calculators
  const results: ComputedKpi[] = [];
  for (const { kpi } of enabled) {
    const fn = CALCULATORS[kpi.key];
    if (!fn) continue; // unknown key — no calculator registered yet
    try {
      results.push({
        key:      kpi.key,
        name:     kpi.name,
        category: kpi.category,
        result:   fn(metrics, settings),
      });
    } catch {
      // Isolate failures — one broken calculator must not abort the whole set
      results.push({
        key:      kpi.key,
        name:     kpi.name,
        category: kpi.category,
        result:   { value: 0, status: 'warning' },
      });
    }
  }

  return results;
}
