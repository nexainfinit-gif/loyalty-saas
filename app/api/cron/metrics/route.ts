import { NextRequest, NextResponse } from 'next/server';
import { runMetricsBatch } from '@/lib/metrics-batch';
import { generateAllGrowthActions } from '@/lib/growth-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/metrics   — called by Vercel Cron at 02:00 UTC
 * POST /api/cron/metrics  — same handler, for manual curl invocations
 *
 * Security: Bearer CRON_SECRET header required.
 * Idempotent: delegates to runMetricsBatch() which uses an ON CONFLICT upsert.
 * No per-restaurant JS loops — one SQL round-trip via compute_restaurant_metrics_batch().
 *
 * After KPI computation, generates growth actions for all restaurants.
 *
 * Response shape:
 *   { success, restaurantsProcessed, durationMs, computedAt, withRevenueEst,
 *     actionsCreated, actionErrors }
 */
function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

async function handler(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const metricsResult = await runMetricsBatch();

    // Generate growth actions after KPIs are fresh
    const actionsResult = await generateAllGrowthActions();
    console.log('[cron/metrics] growth actions:', actionsResult);

    return NextResponse.json({
      ...metricsResult,
      actionsCreated: actionsResult.actionsCreated,
      actionErrors:   actionsResult.errors,
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[cron/metrics] fatal:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET  = handler;
export const POST = handler;
