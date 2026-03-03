import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { runMetricsBatch } from '@/lib/metrics-batch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/metrics/recompute
 * Manually triggers the KPI batch computation for all restaurants.
 * Auth: platform owner only (requireOwner).
 *
 * Cooldown guard: rejects with 429 if a computation completed less than
 * COOLDOWN_SECONDS ago. This prevents DB hammering from repeated button clicks
 * while keeping the handler stateless (no in-process mutex needed — the
 * restaurant_metrics.last_computed_at column IS the shared state).
 *
 * Concurrent safety: runMetricsBatch() uses ON CONFLICT upsert — running two
 * instances simultaneously is safe; last write wins per restaurant.
 *
 * Response (success):
 *   { success, restaurantsProcessed, durationMs, computedAt, withRevenueEst }
 *
 * Response (cooldown):
 *   { error, last_computed_at, retry_after_seconds }  HTTP 429
 */

const COOLDOWN_SECONDS = 60;

export async function POST(request: Request) {
  /* ── Auth ─────────────────────────────────────────────────────────────── */

  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  /* ── Cooldown check (read max last_computed_at) ───────────────────────── */

  const { data: latest } = await supabaseAdmin
    .from('restaurant_metrics')
    .select('last_computed_at')
    .order('last_computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.last_computed_at) {
    const ageSecs = (Date.now() - new Date(latest.last_computed_at).getTime()) / 1000;
    if (ageSecs < COOLDOWN_SECONDS) {
      const retryAfter = Math.ceil(COOLDOWN_SECONDS - ageSecs);
      console.log(
        `[admin/metrics/recompute] rejected — last run ${Math.round(ageSecs)}s ago,` +
        ` retry in ${retryAfter}s`,
      );
      return NextResponse.json(
        {
          error:               'Computation ran too recently — wait before retrying.',
          last_computed_at:    latest.last_computed_at,
          retry_after_seconds: retryAfter,
        },
        { status: 429 },
      );
    }
  }

  /* ── Run batch compute ────────────────────────────────────────────────── */

  try {
    const result = await runMetricsBatch();
    console.log('[admin/metrics/recompute] triggered by owner, result:', result);
    return NextResponse.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[admin/metrics/recompute] fatal:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
