// app/api/scan/[token]/route.ts
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireScannerAuth } from '@/lib/server-auth';
import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { pushPassUpdate } from '@/lib/apns';
import { getTranslator, defaultLocale, locales, type Locale } from '@/lib/i18n-server';

// Rate limiting: max 30 scans per IP per minute (covers busy service periods)
const scanLimiter = rateLimit({ prefix: 'scan-ip', limit: 30, windowMs: 60_000 });

type ScanCustomer = {
  id: string;
  first_name: string;
  last_name: string;
  total_points: number;
  stamps_count: number;
};

/**
 * Resolve a scan token to a customer.
 *
 * Resolution order (stops at first match):
 *  1. customers.qr_token = token  → camera scan (full UUID from barcode.value)
 *  2. customers.id       = token  → legacy passes (barcode.value was customer.id)
 *  3. wallet_passes.short_code = token → manual entry (8-char code shown under QR)
 *
 * All lookups are scoped to restaurantId.
 */
async function resolveScanToken(
  token: string,
  restaurantId: string,
): Promise<{ customer: ScanCustomer | null; resolvedBy: 'qr_token' | 'id' | 'short_code' | 'none' }> {
  // 1. qr_token (primary — what camera reads from barcode.value)
  const { data: byQrToken } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, total_points, stamps_count')
    .eq('qr_token', token)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (byQrToken) return { customer: byQrToken as ScanCustomer, resolvedBy: 'qr_token' };

  // 2. customer.id (legacy fallback)
  const { data: byId } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, total_points, stamps_count')
    .eq('id', token)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (byId) return { customer: byId as ScanCustomer, resolvedBy: 'id' };

  // 3. short_code via wallet_passes (manual entry — 8-char code shown under QR)
  const { data: passRow } = await supabaseAdmin
    .from('wallet_passes')
    .select('customer_id')
    .eq('short_code', token)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .maybeSingle();

  if (passRow?.customer_id) {
    const { data: byShortCode } = await supabaseAdmin
      .from('customers')
      .select('id, first_name, last_name, total_points, stamps_count')
      .eq('id', passRow.customer_id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (byShortCode) return { customer: byShortCode as ScanCustomer, resolvedBy: 'short_code' };
  }

  return { customer: null, resolvedBy: 'none' };
}

/* ── Validate UUID format ────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // ── Resolve locale from query param ─────────────────────────────────
  const url = new URL(req.url);
  const rawLocale = url.searchParams.get('locale') ?? defaultLocale;
  const locale: Locale = (locales as readonly string[]).includes(rawLocale)
    ? (rawLocale as Locale)
    : defaultLocale;
  const t = await getTranslator(locale);

  // IP-based rate limit
  const ip = getClientIp(req);
  if (!scanLimiter.check(ip).success) {
    return Response.json(
      { error: t('api.scanRateLimit') },
      { status: 429 },
    );
  }

  // Accepts both the owner Supabase session (dashboard) and X-Scanner-Token (cashier).
  const guard = await requireScannerAuth(req);
  if (guard instanceof NextResponse) return guard;
  const { restaurantId, userId: scannerUserId } = guard;

  const { token: scanToken } = await params;

  // ── Parse body ─────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const idempotencyKey: string | null = body.idempotency_key ?? null;
  const scanActionId: string | null = body.scan_action_id ?? null;

  if (idempotencyKey && !UUID_RE.test(idempotencyKey)) {
    return Response.json(
      { error: t('api.invalidIdempotencyKey') },
      { status: 400 },
    );
  }

  // ── Idempotency check: replay cached response if key already seen ─────
  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from('scan_events')
      .select('response_cache')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing?.response_cache) {
      return Response.json(existing.response_cache);
    }
  }

  // ── Resolve token to customer ─────────────────────────────────────────
  const { customer, resolvedBy } = await resolveScanToken(scanToken, restaurantId);

  logger.info({ ctx: 'scan', rid: restaurantId, msg: `token="${scanToken}" resolvedBy="${resolvedBy}"` });

  if (!customer) {
    return Response.json({ error: t('api.customerNotFound') }, { status: 404 });
  }

  // ── Loyalty config ────────────────────────────────────────────────────
  const { data: settings } = await supabaseAdmin
    .from('loyalty_settings')
    .select('points_per_scan, reward_threshold, reward_message, program_type, stamps_total')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const programType     = settings?.program_type ?? 'points';
  const stampsTotal     = settings?.stamps_total ?? 10;

  // ── Resolve points to add (scan_action override or default) ─────────
  let pointsToAdd = settings?.points_per_scan ?? 1;
  let scanActionLabel: string | null = null;

  if (scanActionId) {
    const { data: action } = await supabaseAdmin
      .from('scan_actions')
      .select('points_value, label')
      .eq('id', scanActionId)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .maybeSingle();

    if (!action) {
      return Response.json(
        { error: t('api.invalidScanAction') },
        { status: 400 },
      );
    }
    pointsToAdd = action.points_value;
    scanActionLabel = action.label;
  }

  // Capture pre-scan balances for audit trail
  const balanceBefore = customer.total_points;
  const stampsBefore  = customer.stamps_count ?? 0;

  const newBalance = balanceBefore + pointsToAdd;

  // Points-mode reward
  const rewardThreshold = settings?.reward_threshold ?? 100;
  const rewardTriggered = programType === 'points'
    && balanceBefore < rewardThreshold
    && newBalance >= rewardThreshold;

  // Stamps-mode completion (pointsToAdd acts as stamps count in stamps mode)
  const currentStamps      = customer.stamps_count ?? 0;
  const stampsToAdd        = programType === 'stamps' ? pointsToAdd : 0;
  const stampCardCompleted = programType === 'stamps' && (currentStamps + stampsToAdd) >= stampsTotal;
  const stampsDelta    = programType !== 'stamps' ? 0
    : stampCardCompleted ? (stampsToAdd - stampsTotal)
    : stampsToAdd;

  // ── Transaction insert (DB trigger atomically updates customer) ────────
  const { error: insertError } = await supabaseAdmin.from('transactions').insert({
    restaurant_id: restaurantId,
    customer_id:   customer.id,
    type:          'visit',
    points_delta:  pointsToAdd,
    stamps_delta:  stampsDelta,
    balance_after: newBalance,
    metadata:      {
      reason: scanActionLabel ? `Scan: ${scanActionLabel}` : 'Scan caisse',
      ...(scanActionId ? { scan_action_id: scanActionId } : {}),
    },
  });

  if (insertError) {
    logger.error({ ctx: 'scan', rid: restaurantId, msg: 'transaction insert failed', err: insertError.message });
    return Response.json(
      { error: t('api.scanError') },
      { status: 500 },
    );
  }

  // ── Re-read actual post-trigger balances (concurrency-safe) ───────────
  const { data: fresh } = await supabaseAdmin
    .from('customers')
    .select('total_points, stamps_count')
    .eq('id', customer.id)
    .maybeSingle();

  const actualBalance = fresh?.total_points ?? newBalance;
  const actualStamps  = fresh?.stamps_count ?? (currentStamps + stampsDelta);

  // ── Build response payload ────────────────────────────────────────────
  const responsePayload = {
    success: true,
    program_type: programType,
    customer: {
      id:           customer.id,
      first_name:   customer.first_name,
      last_name:    customer.last_name,
      total_points: actualBalance,
      stamps_count: actualStamps,
    },
    points_added:         pointsToAdd,
    reward_triggered:     rewardTriggered,
    stamps_added:         stampsToAdd,
    stamps_total:         stampsTotal,
    stamp_card_completed: stampCardCompleted,
    reward_message: settings?.reward_message ?? t('api.defaultReward'),
    scan_action_label: scanActionLabel,
  };

  // ── Insert scan_events audit row ──────────────────────────────────────
  const scanEventInsert = {
    restaurant_id:       restaurantId,
    customer_id:         customer.id,
    idempotency_key:     idempotencyKey,
    resolved_by:         resolvedBy,
    points_awarded:      pointsToAdd,
    stamps_delta:        stampsDelta,
    balance_before:      balanceBefore,
    balance_after:       actualBalance,
    stamps_before:       stampsBefore,
    stamps_after:        actualStamps,
    program_type:        programType,
    reward_triggered:    rewardTriggered,
    stamp_card_completed: stampCardCompleted,
    scanner_user_id:     scannerUserId,
    response_cache:      responsePayload,
  };

  const { data: scanEvent, error: scanEventErr } = await supabaseAdmin
    .from('scan_events')
    .insert(scanEventInsert)
    .select('id')
    .single();

  // Handle unique constraint violation on idempotency_key (concurrent duplicate)
  if (scanEventErr?.code === '23505' && idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from('scan_events')
      .select('response_cache')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing?.response_cache) {
      return Response.json(existing.response_cache);
    }
  }

  if (scanEventErr) {
    // Non-critical: scan succeeded but audit insert failed. Log and continue.
    logger.error({ ctx: 'scan', rid: restaurantId, msg: 'scan_events insert failed', err: scanEventErr.message });
  }

  // ── Wallet sync + APNS push (awaited to ensure execution on Vercel) ─────
  const { error: syncErr } = await supabaseAdmin.from('wallet_sync_queue').insert({
    scan_event_id: scanEvent?.id ?? null,
    customer_id:   customer.id,
    restaurant_id: restaurantId,
  });
  if (syncErr) logger.error({ ctx: 'scan', rid: restaurantId, msg: 'wallet_sync_queue insert failed', err: syncErr.message });

  // APNS push for Apple Wallet passes
  try {
    const { data: applePasses } = await supabaseAdmin
      .from('wallet_passes')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('platform', 'apple')
      .eq('status', 'active');

    if (applePasses?.length) {
      await Promise.allSettled(applePasses.map(pass => pushPassUpdate(pass.id)));
    }
  } catch (err) {
    logger.error({ ctx: 'scan', rid: restaurantId, msg: 'APNS push failed', err: err instanceof Error ? err.message : String(err) });
  }

  return Response.json(responsePayload);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // ── Resolve locale from query param ─────────────────────────────────
  const getUrl = new URL(req.url);
  const getRawLocale = getUrl.searchParams.get('locale') ?? defaultLocale;
  const getLocale: Locale = (locales as readonly string[]).includes(getRawLocale)
    ? (getRawLocale as Locale)
    : defaultLocale;
  const tGet = await getTranslator(getLocale);

  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return Response.json({ error: tGet('api.restaurantNotFound') }, { status: 404 });
  }

  const { token: scanToken } = await params;

  // For GET, resolve by qr_token or id only (short_code is a pass-level concept, not used for preview)
  const { data: byQrToken } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, total_points, last_visit_at')
    .eq('qr_token', scanToken)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();

  if (byQrToken) return Response.json({ customer: byQrToken });

  const { data: byId } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, total_points, last_visit_at')
    .eq('id', scanToken)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();

  if (byId) return Response.json({ customer: byId });

  return Response.json({ error: tGet('api.customerNotFound') }, { status: 404 });
}
