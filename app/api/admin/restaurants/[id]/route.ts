import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * PATCH /api/admin/restaurants/[id]
 * Assign a plan to a restaurant.
 * Auth: platform owner only.
 *
 * Body: { plan_id: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = params;
  const body = await request.json().catch(() => null);

  if (!body?.plan_id) {
    return NextResponse.json({ error: 'plan_id est requis.' }, { status: 400 });
  }

  // Verify plan exists
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, key, name')
    .eq('id', body.plan_id)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: 'Plan introuvable.' }, { status: 404 });
  }

  const { data: restaurant, error } = await supabaseAdmin
    .from('restaurants')
    .update({ plan_id: plan.id, plan: plan.key })
    .eq('id', id)
    .select('id, name, plan, plan_id')
    .maybeSingle();

  if (error || !restaurant) {
    return NextResponse.json({ error: 'Erreur mise à jour du plan.' }, { status: 500 });
  }

  return NextResponse.json({ restaurant });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/restaurants/[id]
 * Returns full restaurant detail + 30-day metrics trend.
 * Auth: platform owner only.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = params;

  // Restaurant base info
  const { data: restaurant, error: restErr } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, plan, plan_id, primary_color, logo_url, created_at')
    .eq('id', id)
    .maybeSingle();

  if (restErr || !restaurant) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  // Health snapshot
  const { data: snapshot } = await supabaseAdmin
    .from('restaurant_health_snapshot')
    .select('health_score, upgrade_score, churn_risk_score, reasons, computed_at')
    .eq('restaurant_id', id)
    .maybeSingle();

  // 30-day metrics trend (ordered ASC for chart)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const { data: trend } = await supabaseAdmin
    .from('restaurant_metrics_daily')
    .select('date, scans_count, unique_customers_scanned, registrations_count, rewards_triggered_count, active_customers_30d, total_customers, wallet_passes_issued')
    .eq('restaurant_id', id)
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: true });

  // Live totals
  const { count: totalCustomers } = await supabaseAdmin
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', id);

  const { count: totalScans } = await supabaseAdmin
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', id);

  const { count: activeWalletPasses } = await supabaseAdmin
    .from('wallet_passes')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', id)
    .eq('status', 'active');

  // Lifetime totals summary
  const totals = {
    customers:     totalCustomers    ?? 0,
    scans:         totalScans        ?? 0,
    wallet_passes: activeWalletPasses ?? 0,
  };

  return NextResponse.json({
    restaurant: {
      ...restaurant,
      health_score:      snapshot?.health_score      ?? 0,
      upgrade_score:     snapshot?.upgrade_score     ?? 0,
      churn_risk_score:  snapshot?.churn_risk_score  ?? 0,
      reasons:           snapshot?.reasons           ?? [],
      snapshot_at:       snapshot?.computed_at       ?? null,
    },
    totals,
    trend: trend ?? [],
  });
}
