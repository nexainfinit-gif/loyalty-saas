import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/growth/summary
 * Returns platform-level aggregates + KPI engine freshness.
 * Auth: platform owner only.
 *
 * Response:
 * {
 *   total_restaurants:    number,
 *   churn_risk_count:     number,
 *   upgrade_ready_count:  number,
 *   free_count:           number,
 *   kpiLastComputedAt:    string | null,
 *   kpiFreshness:         'fresh' | 'stale' | 'missing',
 * }
 *
 * Freshness thresholds:
 *   missing — no rows in restaurant_metrics
 *   fresh   — last computed < 2 hours ago
 *   stale   — last computed >= 24 hours ago  (warning banner shown in UI)
 *   (2–24 h is the normal nightly window — treated as fresh)
 */

type KpiFreshness = 'fresh' | 'stale' | 'missing';

function computeFreshness(lastComputedAt: string | null): KpiFreshness {
  if (!lastComputedAt) return 'missing';
  const ageHours = (Date.now() - new Date(lastComputedAt).getTime()) / 3_600_000;
  if (ageHours < 2)  return 'fresh';
  if (ageHours >= 24) return 'stale';
  return 'fresh'; // 2–24 h: within normal cron window, not yet stale
}

export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  // Fetch free restaurant IDs first — needed as filter for upgrade_ready_count
  const { data: freeRestaurants } = await supabaseAdmin
    .from('restaurants')
    .select('id')
    .eq('plan', 'free');

  const freeIds = (freeRestaurants ?? []).map((r) => r.id);

  const [
    { count: totalRestaurants },
    { count: churnRiskCount },
    { count: upgradeReadyCount },
    { data: latestMetrics },
  ] = await Promise.all([
    supabaseAdmin
      .from('restaurants')
      .select('id', { count: 'exact', head: true }),

    supabaseAdmin
      .from('restaurant_health_snapshot')
      .select('restaurant_id', { count: 'exact', head: true })
      .gte('churn_risk_score', 60),

    freeIds.length > 0
      ? supabaseAdmin
          .from('restaurant_health_snapshot')
          .select('restaurant_id', { count: 'exact', head: true })
          .in('restaurant_id', freeIds)
          .gte('upgrade_score', 50)
      : Promise.resolve({ count: 0 }),

    // Max last_computed_at across all restaurants in one indexed read
    supabaseAdmin
      .from('restaurant_metrics')
      .select('last_computed_at')
      .order('last_computed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const kpiLastComputedAt = latestMetrics?.last_computed_at ?? null;
  const kpiFreshness      = computeFreshness(kpiLastComputedAt);

  return NextResponse.json({
    total_restaurants:   totalRestaurants  ?? 0,
    churn_risk_count:    churnRiskCount    ?? 0,
    upgrade_ready_count: upgradeReadyCount ?? 0,
    free_count:          freeIds.length,
    kpiLastComputedAt,
    kpiFreshness,
  });
}
