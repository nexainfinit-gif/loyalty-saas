import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/metrics-daily
 * Runs daily at 01:00 UTC (after midnight, aggregating yesterday's data).
 * Secured with CRON_SECRET Bearer token.
 *
 * Responsibilities:
 * 1. For every restaurant, upsert one row into restaurant_metrics_daily for yesterday.
 * 2. Recompute health/upgrade/churn_risk scores → upsert restaurant_health_snapshot.
 */

/* ── Score helpers ──────────────────────────────────────────────────────────── */

/** Clamp a number to [0, 100] and round. */
function score(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(raw)));
}

interface DayRow {
  scans_count: number;
  unique_customers_scanned: number;
  registrations_count: number;
  active_customers_30d: number;
  total_customers: number;
}

interface SnapshotInput {
  restaurantId:  string;
  plan:          string;
  last7Days:     DayRow[];  // ordered DESC (index 0 = yesterday)
  prev7Days:     DayRow[];  // days 7-13
}

function computeScores(input: SnapshotInput): {
  health_score: number;
  upgrade_score: number;
  churn_risk_score: number;
  reasons: string[];
} {
  const { plan, last7Days, prev7Days } = input;
  const reasons: string[] = [];

  /* Health score — 0-100 */
  const totalScansLast7   = last7Days.reduce((s, r) => s + r.scans_count, 0);
  const activeLast30      = last7Days[0]?.active_customers_30d ?? 0;
  const totalCust         = last7Days[0]?.total_customers ?? 0;

  let healthRaw = 0;
  // 50 pts from weekly scan velocity (cap: 50 scans/week = full score)
  healthRaw += Math.min(50, (totalScansLast7 / 50) * 50);
  // 50 pts from engagement ratio (active_30d / total_customers)
  if (totalCust > 0) healthRaw += Math.min(50, (activeLast30 / totalCust) * 50);
  const health_score = score(healthRaw);

  if (totalScansLast7 === 0) reasons.push('Aucun scan les 7 derniers jours');
  else if (totalScansLast7 < 5) reasons.push(`Seulement ${totalScansLast7} scans en 7 jours`);
  if (totalCust > 0 && activeLast30 / totalCust < 0.2)
    reasons.push(`Moins de 20% des clients actifs (${activeLast30}/${totalCust})`);
  if (health_score >= 70) reasons.push('Bonne activité générale');

  /* Upgrade score — only meaningful for free plan */
  let upgrade_score = 0;
  if (plan === 'free') {
    // High health on free plan = good upgrade candidate
    upgrade_score = score(health_score * 1.0);
    if (totalScansLast7 >= 20) reasons.push('Volume élevé → candidat upgrade');
    if (totalCust >= 50)       reasons.push(`${totalCust} clients enregistrés`);
  } else {
    // Already paying — low upgrade signal
    upgrade_score = 0;
    reasons.push(`Plan actuel: ${plan}`);
  }

  /* Churn risk score — 0-100 */
  const scansLast7 = last7Days.reduce((s, r) => s + r.scans_count, 0);
  const scansPrev7 = prev7Days.reduce((s, r) => s + r.scans_count, 0);

  let churnRaw = 0;
  // No activity at all → high risk
  if (scansLast7 === 0 && scansPrev7 === 0) {
    churnRaw = 90;
    reasons.push('Aucun scan les 14 derniers jours');
  } else if (scansLast7 === 0 && scansPrev7 > 0) {
    churnRaw = 75;
    reasons.push('Activité arrêtée cette semaine');
  } else if (scansPrev7 > 0) {
    const drop = (scansPrev7 - scansLast7) / scansPrev7;
    if (drop > 0.5) {
      churnRaw = score(drop * 80);
      reasons.push(`Chute de ${Math.round(drop * 100)}% des scans vs semaine précédente`);
    } else if (drop > 0.2) {
      churnRaw = score(drop * 50);
    }
  }
  const churn_risk_score = score(churnRaw);

  return { health_score, upgrade_score, churn_risk_score, reasons };
}

/* ── Main handler ───────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  // Security gate
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now       = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yDate = yesterday.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Fetch all restaurants
  const { data: restaurants, error: restaurantErr } = await supabaseAdmin
    .from('restaurants')
    .select('id, plan');

  if (restaurantErr || !restaurants) {
    console.error('[cron/metrics-daily] restaurants fetch failed:', restaurantErr);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  let upserted = 0;
  let snapshotsUpdated = 0;
  const errors: string[] = [];

  for (const restaurant of restaurants) {
    try {
      const rid = restaurant.id;

      /* ── 1. Yesterday's activity metrics ──────────────────────────────────── */

      const yStart = `${yDate}T00:00:00.000Z`;
      const yEnd   = `${yDate}T23:59:59.999Z`;

      const [
        { count: scansCount },
        { data: scanCustomers },
        { count: registrations },
        { count: rewards },
        { count: walletPasses },
        { count: activeCust30d },
        { count: totalCust },
      ] = await Promise.all([
        // Total scans yesterday
        supabaseAdmin
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rid)
          .gte('created_at', yStart)
          .lte('created_at', yEnd),
        // Unique customers scanned yesterday (need distinct)
        supabaseAdmin
          .from('transactions')
          .select('customer_id')
          .eq('restaurant_id', rid)
          .gte('created_at', yStart)
          .lte('created_at', yEnd),
        // New registrations yesterday
        supabaseAdmin
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rid)
          .gte('created_at', yStart)
          .lte('created_at', yEnd),
        // Rewards triggered yesterday: stamp card completions have stamps_delta < 0
        supabaseAdmin
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rid)
          .lt('stamps_delta', 0)
          .gte('created_at', yStart)
          .lte('created_at', yEnd),
        // Wallet passes issued yesterday
        supabaseAdmin
          .from('wallet_passes')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rid)
          .gte('created_at', yStart)
          .lte('created_at', yEnd),
        // Active customers in last 30d: customers with a recent visit
        supabaseAdmin
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rid)
          .gte('last_visit_at', new Date(Date.now() - 30 * 86400 * 1000).toISOString()),
        // Total customers
        supabaseAdmin
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', rid),
      ]);

      const uniqueScanned = new Set(scanCustomers?.map((r) => r.customer_id) ?? []).size;

      const { error: upsertErr } = await supabaseAdmin
        .from('restaurant_metrics_daily')
        .upsert({
          date:                     yDate,
          restaurant_id:            rid,
          scans_count:              scansCount ?? 0,
          unique_customers_scanned: uniqueScanned,
          registrations_count:      registrations ?? 0,
          rewards_triggered_count:  rewards ?? 0,
          active_customers_30d:     activeCust30d ?? 0,
          total_customers:          totalCust ?? 0,
          wallet_passes_issued:     walletPasses ?? 0,
          updated_at:               now.toISOString(),
        }, { onConflict: 'date,restaurant_id' });

      if (upsertErr) {
        errors.push(`[${rid}] metrics upsert: ${upsertErr.message}`);
        continue;
      }
      upserted++;

      /* ── 2. Recompute health snapshot ─────────────────────────────────────── */

      // Fetch last 14 days of daily metrics for scoring
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10);
      const { data: history } = await supabaseAdmin
        .from('restaurant_metrics_daily')
        .select('date, scans_count, unique_customers_scanned, registrations_count, active_customers_30d, total_customers')
        .eq('restaurant_id', rid)
        .gte('date', fourteenDaysAgo)
        .order('date', { ascending: false });

      const allDays  = (history ?? []) as DayRow[];
      const last7    = allDays.slice(0, 7);
      const prev7    = allDays.slice(7, 14);

      const { health_score, upgrade_score, churn_risk_score, reasons } = computeScores({
        restaurantId: rid,
        plan:         restaurant.plan ?? 'free',
        last7Days:    last7,
        prev7Days:    prev7,
      });

      const { error: snapErr } = await supabaseAdmin
        .from('restaurant_health_snapshot')
        .upsert({
          restaurant_id:    rid,
          computed_at:      now.toISOString(),
          health_score,
          upgrade_score,
          churn_risk_score,
          reasons:          JSON.stringify(reasons),
        }, { onConflict: 'restaurant_id' });

      if (snapErr) {
        errors.push(`[${rid}] snapshot upsert: ${snapErr.message}`);
      } else {
        snapshotsUpdated++;
      }

    } catch (err) {
      errors.push(`[${restaurant.id}] unexpected: ${(err as Error).message}`);
    }
  }

  console.log(
    `[cron/metrics-daily] date=${yDate} restaurants=${restaurants.length}` +
    ` upserted=${upserted} snapshots=${snapshotsUpdated} errors=${errors.length}`
  );

  return NextResponse.json({
    success: true,
    date:               yDate,
    restaurants_total:  restaurants.length,
    metrics_upserted:   upserted,
    snapshots_updated:  snapshotsUpdated,
    errors,
  });
}
