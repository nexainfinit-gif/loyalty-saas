import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getEnabledKpis } from '@/lib/kpi-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/restaurant-metrics
 *
 * Returns pre-computed KPI metrics for the authenticated restaurant owner.
 * Field visibility is driven EXCLUSIVELY by the plan_kpis table — no hardcoded
 * plan string checks. Updating plan_kpis in the DB is immediately reflected
 * the next time the client fetches this endpoint (no cache, force-dynamic).
 *
 * KPI key → metric field mapping
 * ─────────────────────────────────────────────────────────────
 *  Tier 0 (always)
 *    total_customers   → total_customers
 *    total_scans       → visits_30d
 *
 *  Tier 1 (growth analytics)
 *    new_customers_30d    → new_customers_30d
 *    active_customers_30d → active_customers_30d + repeat_rate (always paired)
 *    wallet_pass_rate     → wallet_passes_issued + wallet_active_passes
 *
 *  Tier 2 (revenue / completion)
 *    revenue_estimate → estimated_revenue_30d
 *    rewards_issued   → completed_cards
 * ─────────────────────────────────────────────────────────────
 *
 * Legacy fallback: when restaurants.plan_id is NULL (old restaurant rows),
 * access is derived from the restaurants.plan string for backward compat.
 *
 * Response also includes `enabledKpiKeys: string[]` so the client can drive
 * UI feature flags without additional round-trips.
 *
 * Returns { metrics: null } when the nightly cron has not yet run.
 * Auth: any authenticated restaurant owner.
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;

  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  // Fetch pre-computed snapshot + DB-driven KPI access list in parallel.
  // When plan_id is present we use getEnabledKpis(); otherwise skip the DB
  // round-trip and use the legacy fallback below.
  const [{ data: raw }, enabledKpisFromDB] = await Promise.all([
    supabaseAdmin
      .from('restaurant_metrics')
      .select(
        'total_customers, new_customers_30d, active_customers_30d, visits_30d,' +
        'repeat_rate, wallet_passes_issued, wallet_active_passes,' +
        'completed_cards, estimated_revenue_30d, last_computed_at',
      )
      .eq('restaurant_id', guard.restaurantId)
      .maybeSingle(),
    guard.planId
      ? getEnabledKpis(guard.restaurantId)
      : Promise.resolve(null),
  ]);

  if (!raw) {
    return NextResponse.json({ metrics: null });
  }

  /* ── Resolve enabled KPI keys ─────────────────────────────────────────── */

  let enabled: Set<string>;

  if (enabledKpisFromDB !== null) {
    // PRIMARY PATH — plan_id is set → use plan_kpis exclusively.
    // This is the DB-driven path. Any change to plan_kpis is immediately
    // visible here with no code changes needed.
    enabled = new Set(enabledKpisFromDB.map((k) => k.key));
  } else {
    // LEGACY FALLBACK — plan_id not set on this restaurant row.
    // Derived from the plan string so old data isn't regressed.
    const plan         = guard.plan ?? 'free';
    const isLegacyPaid = plan !== 'free' && plan !== 'starter';
    const isLegacyPro  = plan === 'pro'  || plan === 'enterprise';

    enabled = new Set<string>([
      'total_customers',
      'total_scans',
      ...(isLegacyPaid ? ['new_customers_30d', 'active_customers_30d', 'wallet_pass_rate'] : []),
      ...(isLegacyPro  ? ['revenue_estimate', 'rewards_issued'] : []),
    ]);
  }

  /* ── Compose response — each field gated by its KPI key ──────────────── */

  const metrics: Record<string, unknown> = {
    // Tier 0 — always visible
    total_customers:  raw.total_customers,
    visits_30d:       raw.visits_30d,
    last_computed_at: raw.last_computed_at,
  };

  // new_customers_30d
  if (enabled.has('new_customers_30d')) {
    metrics.new_customers_30d = raw.new_customers_30d;
  }

  // active_customers_30d always carries repeat_rate alongside it
  if (enabled.has('active_customers_30d')) {
    metrics.active_customers_30d = raw.active_customers_30d;
    metrics.repeat_rate          = raw.repeat_rate;
  }

  // wallet_pass_rate unlocks both wallet counters
  if (enabled.has('wallet_pass_rate')) {
    metrics.wallet_passes_issued = raw.wallet_passes_issued;
    metrics.wallet_active_passes = raw.wallet_active_passes;
  }

  // revenue_estimate → pre-computed revenue field
  if (enabled.has('revenue_estimate')) {
    metrics.estimated_revenue_30d = raw.estimated_revenue_30d;
  }

  // rewards_issued → completed loyalty cards
  if (enabled.has('rewards_issued')) {
    metrics.completed_cards = raw.completed_cards;
  }

  // Expose the full enabled set so the client can drive UI feature flags
  // (e.g. show/hide Wallet Studio link, wallet pass buttons) without extra fetches.
  return NextResponse.json({
    metrics,
    plan:           guard.plan,
    enabledKpiKeys: [...enabled],
  });
}
