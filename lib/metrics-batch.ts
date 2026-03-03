import { supabaseAdmin } from '@/lib/supabase-admin';

/* ── Types ────────────────────────────────────────────────────────────────── */

/** Shape returned by compute_restaurant_metrics_batch() SQL function. */
type BatchRow = {
  restaurant_id:        string;
  total_customers:      number;
  new_customers_30d:    number;
  active_customers_30d: number;
  visits_30d:           number;
  repeat_visitors_30d:  number;
  wallet_passes_issued: number;
  wallet_active_passes: number;
  completed_cards_30d:  number;
  last_activity_at:     string | null;
};

export interface BatchComputeResult {
  restaurantsProcessed: number;
  durationMs:           number;
  computedAt:           string;
  withRevenueEst:       number;
  success:              true;
}

/* ── Core function ────────────────────────────────────────────────────────── */

/**
 * Runs the DB batch function → derives JS-side metrics → upserts restaurant_metrics.
 *
 * Idempotent: the upsert uses ON CONFLICT (restaurant_id) DO UPDATE, so calling
 * this multiple times concurrently is safe — last write wins per restaurant.
 *
 * Throws on DB errors (caller decides how to surface the error).
 */
export async function runMetricsBatch(): Promise<BatchComputeResult> {
  const startMs    = Date.now();
  const computedAt = new Date().toISOString();

  /* ── Step 1: one SQL round-trip for all restaurants ───────────────────── */

  const { data: rawMetrics, error: fnErr } = await supabaseAdmin
    .rpc('compute_restaurant_metrics_batch');

  if (fnErr || !rawMetrics) {
    throw new Error(
      `compute_restaurant_metrics_batch failed: ${fnErr?.message ?? 'no data returned'}`,
    );
  }

  /* ── Step 2: fetch avg_ticket settings for revenue estimate ───────────── */

  const { data: ticketSettings, error: settingsErr } = await supabaseAdmin
    .from('restaurant_settings')
    .select('restaurant_id, value')
    .eq('key', 'average_ticket');

  if (settingsErr) {
    // Non-fatal — revenue estimate will be null for all restaurants
    console.warn('[metrics-batch] restaurant_settings fetch failed:', settingsErr.message);
  }

  const ticketMap = new Map<string, number>(
    (ticketSettings ?? [])
      .map((s): [string, number] | null => {
        const v = parseFloat(s.value);
        return Number.isFinite(v) && v > 0 ? [s.restaurant_id, v] : null;
      })
      .filter((e): e is [string, number] => e !== null),
  );

  /* ── Step 3: derive JS-side fields, build upsert payload ─────────────── */

  const upsertRows = (rawMetrics as BatchRow[]).map((m) => {
    // repeat_rate: returning visitors / active visitors × 100, capped to [0, 100]
    const repeatRate =
      m.active_customers_30d > 0
        ? Math.min(100, Math.round((m.repeat_visitors_30d / m.active_customers_30d) * 10000) / 100)
        : 0;

    // estimated_revenue_30d: null when avg_ticket not configured for this restaurant
    const avgTicket       = ticketMap.get(m.restaurant_id) ?? null;
    const estimatedRevenue =
      avgTicket !== null
        ? Math.round(m.visits_30d * avgTicket * 100) / 100
        : null;

    return {
      restaurant_id:         m.restaurant_id,
      total_customers:       Number(m.total_customers),
      new_customers_30d:     Number(m.new_customers_30d),
      active_customers_30d:  Number(m.active_customers_30d),
      visits_30d:            Number(m.visits_30d),
      repeat_rate:           repeatRate,
      wallet_passes_issued:  Number(m.wallet_passes_issued),
      wallet_active_passes:  Number(m.wallet_active_passes),
      completed_cards:       Number(m.completed_cards_30d),
      estimated_revenue_30d: estimatedRevenue,
      last_activity_at:      m.last_activity_at ?? null,
      last_computed_at:      computedAt,
    };
  });

  /* ── Step 4: upsert (idempotent, conflict = last write wins) ──────────── */

  const { error: upsertErr } = await supabaseAdmin
    .from('restaurant_metrics')
    .upsert(upsertRows, { onConflict: 'restaurant_id' });

  if (upsertErr) {
    throw new Error(`restaurant_metrics upsert failed: ${upsertErr.message}`);
  }

  const durationMs = Date.now() - startMs;

  console.log(
    `[metrics-batch] ok` +
    ` restaurants=${upsertRows.length}` +
    ` revenue_est=${ticketMap.size}` +
    ` duration_ms=${durationMs}` +
    ` computed_at=${computedAt}`,
  );

  return {
    restaurantsProcessed: upsertRows.length,
    durationMs,
    computedAt,
    withRevenueEst: ticketMap.size,
    success: true,
  };
}
