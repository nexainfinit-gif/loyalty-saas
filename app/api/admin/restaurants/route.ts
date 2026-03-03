import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/restaurants
 * Returns all restaurants with their latest health snapshot + yesterday's metrics.
 * Auth: platform owner only (requireOwner).
 *
 * Query params:
 *   filter  = 'upgrade' | 'churn' | 'free' | 'all'  (default: 'all')
 *   sort    = 'health' | 'upgrade' | 'churn' | 'customers' | 'scans' | 'name'
 *   order   = 'asc' | 'desc'  (default: 'desc')
 */
export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const url    = new URL(request.url);
  const filter = url.searchParams.get('filter') ?? 'all';
  const sort   = url.searchParams.get('sort')   ?? 'health';
  const order  = url.searchParams.get('order')  ?? 'desc';

  // Fetch all restaurants with plan name via join
  const { data: restaurants, error: restErr } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, plan, plan_id, created_at, plans(name)');

  if (restErr || !restaurants) {
    return NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 });
  }

  // Fetch all health snapshots
  const { data: snapshots } = await supabaseAdmin
    .from('restaurant_health_snapshot')
    .select('restaurant_id, health_score, upgrade_score, churn_risk_score, reasons, computed_at');

  const snapshotMap = new Map(
    (snapshots ?? []).map((s) => [s.restaurant_id, s])
  );

  // Fetch yesterday's metrics for all restaurants
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yDate = yesterday.toISOString().slice(0, 10);

  const { data: metrics } = await supabaseAdmin
    .from('restaurant_metrics_daily')
    .select('restaurant_id, scans_count, unique_customers_scanned, registrations_count, active_customers_30d, total_customers, wallet_passes_issued')
    .eq('date', yDate);

  const metricsMap = new Map(
    (metrics ?? []).map((m) => [m.restaurant_id, m])
  );

  // Fetch total customers per restaurant (live count — fallback if metrics missing)
  const { data: customerCounts } = await supabaseAdmin
    .from('customers')
    .select('restaurant_id');

  const custMap = new Map<string, number>();
  for (const c of customerCounts ?? []) {
    custMap.set(c.restaurant_id, (custMap.get(c.restaurant_id) ?? 0) + 1);
  }

  // Build unified rows
  let rows = restaurants.map((r) => {
    const snap    = snapshotMap.get(r.id);
    const day     = metricsMap.get(r.id);
    const custTot = custMap.get(r.id) ?? 0;

    return {
      id:                r.id,
      name:              r.name,
      slug:              r.slug,
      plan:              r.plan ?? 'free',
      plan_name:         (r.plans as { name: string } | null)?.name ?? r.plan ?? 'free',
      created_at:        r.created_at,
      health_score:      snap?.health_score      ?? 0,
      upgrade_score:     snap?.upgrade_score     ?? 0,
      churn_risk_score:  snap?.churn_risk_score  ?? 0,
      reasons: (() => {
        const raw = snap?.reasons ?? [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
        return [];
      })(),
      snapshot_at:       snap?.computed_at       ?? null,
      scans_yesterday:   day?.scans_count        ?? 0,
      unique_scanned:    day?.unique_customers_scanned ?? 0,
      registrations:     day?.registrations_count     ?? 0,
      active_30d:        day?.active_customers_30d    ?? 0,
      total_customers:   custTot,
      wallet_issued:     day?.wallet_passes_issued    ?? 0,
    };
  });

  // Apply filter
  if (filter === 'upgrade') rows = rows.filter((r) => r.plan === 'free' && r.upgrade_score >= 50);
  if (filter === 'churn')   rows = rows.filter((r) => r.churn_risk_score >= 60);
  if (filter === 'free')    rows = rows.filter((r) => r.plan === 'free');

  // Apply sort
  const sortFn = (a: typeof rows[0], b: typeof rows[0]) => {
    let diff = 0;
    if (sort === 'health')     diff = a.health_score     - b.health_score;
    else if (sort === 'upgrade')    diff = a.upgrade_score    - b.upgrade_score;
    else if (sort === 'churn')      diff = a.churn_risk_score - b.churn_risk_score;
    else if (sort === 'customers')  diff = a.total_customers  - b.total_customers;
    else if (sort === 'scans')      diff = a.scans_yesterday  - b.scans_yesterday;
    else if (sort === 'name')       diff = a.name.localeCompare(b.name);
    return order === 'asc' ? diff : -diff;
  };
  rows.sort(sortFn);

  return NextResponse.json({ restaurants: rows, date: yDate });
}
