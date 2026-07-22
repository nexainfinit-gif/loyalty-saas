// app/api/scan/[token]/route.ts
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireScannerAuth } from '@/lib/server-auth';
import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { pushPassUpdate } from '@/lib/apns';
import { syncGooglePassesNow } from '@/lib/wallet-sync-now';
import { sendRewardReachedEmail, sendNearRewardEmail } from '@/lib/email';
import { getTranslator, defaultLocale, locales, type Locale } from '@/lib/i18n-server';

// Rate limiting: max 30 scans per IP per minute (covers busy service periods)
const scanLimiter = rateLimit({ prefix: 'scan-ip', limit: 30, windowMs: 60_000 });

type ScanCustomer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  total_points: number;
  stamps_count: number;
  reward_pending: boolean;
};

type ResolvedPass = {
  id: string;
  pass_kind: string;
  total_points: number;
  stamps_count: number;
  reward_pending: boolean;
} | null;

/**
 * Resolve a scan token to a customer.
 *
 * Resolution order (stops at first match):
 *  1. customers.qr_token = token  → camera scan (full UUID from barcode.value)
 *  2. customers.id       = token  → legacy passes (barcode.value was customer.id)
 *  3. wallet_passes.id   = token  → barcode fallback (some passes stored pass.id)
 *  4. wallet_passes.short_code = token → manual entry (8-char code shown under QR)
 *
 * All lookups are scoped to restaurantId.
 */
type ScanResolution = {
  customer: ScanCustomer | null;
  resolvedBy: 'qr_token' | 'id' | 'pass_id' | 'short_code' | 'none';
  resolvedPassId: string | null;
};

async function resolveScanToken(
  token: string,
  restaurantId: string,
): Promise<ScanResolution> {
  // 1. qr_token (primary — what camera reads from barcode.value)
  const { data: byQrToken } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, email, total_points, stamps_count, reward_pending')
    .eq('qr_token', token)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (byQrToken) return { customer: byQrToken as ScanCustomer, resolvedBy: 'qr_token', resolvedPassId: null };

  // 2. customer.id (legacy fallback)
  const { data: byId } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, email, total_points, stamps_count, reward_pending')
    .eq('id', token)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (byId) return { customer: byId as ScanCustomer, resolvedBy: 'id', resolvedPassId: null };

  // 3. wallet_passes.id (barcode fallback — some passes stored pass.id as barcode value)
  const { data: byPassId } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, customer_id')
    .eq('id', token)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .maybeSingle();

  if (byPassId?.customer_id) {
    const { data: custFromPass } = await supabaseAdmin
      .from('customers')
      .select('id, first_name, last_name, email, total_points, stamps_count, reward_pending')
      .eq('id', byPassId.customer_id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (custFromPass) return { customer: custFromPass as ScanCustomer, resolvedBy: 'pass_id', resolvedPassId: byPassId.id };
  }

  // 4. short_code via wallet_passes (manual entry — 8-char code shown under QR)
  const { data: passRow } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, customer_id')
    .eq('short_code', token)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .maybeSingle();

  if (passRow?.customer_id) {
    const { data: byShortCode } = await supabaseAdmin
      .from('customers')
      .select('id, first_name, last_name, email, total_points, stamps_count, reward_pending')
      .eq('id', passRow.customer_id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (byShortCode) return { customer: byShortCode as ScanCustomer, resolvedBy: 'short_code', resolvedPassId: passRow.id };
  }

  return { customer: null, resolvedBy: 'none', resolvedPassId: null };
}

/**
 * Find the active wallet pass to increment for this scan.
 *
 * Resolution order:
 *  1. If resolveScanToken already identified a specific pass → use it
 *  2. Otherwise, find the active pass matching the restaurant's current program_type
 *  3. If none matches, find the most recently issued active pass
 *  4. If no pass at all → null (legacy: customer-level counters only)
 */
async function resolveTargetPass(
  resolvedPassId: string | null,
  customerId: string,
  restaurantId: string,
  programType: string,
): Promise<ResolvedPass> {
  if (resolvedPassId) {
    const { data } = await supabaseAdmin
      .from('wallet_passes')
      .select('id, pass_kind, total_points, stamps_count, reward_pending')
      .eq('id', resolvedPassId)
      .eq('status', 'active')
      .maybeSingle();
    if (data) return data as ResolvedPass;
  }

  // Find active pass matching current program_type
  const { data: byKind } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, pass_kind, total_points, stamps_count, reward_pending')
    .eq('customer_id', customerId)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .eq('pass_kind', programType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byKind) return byKind as ResolvedPass;

  // Fallback: most recent active pass of any kind
  const { data: anyPass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, pass_kind, total_points, stamps_count, reward_pending')
    .eq('customer_id', customerId)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return anyPass ? (anyPass as ResolvedPass) : null;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract the scan token from a raw QR code value.
 *
 * QR codes may contain:
 *  - A raw UUID token (from Apple/Google Wallet pass barcode)
 *  - A full URL like https://app.rebites.be/api/scan/{token} (from register success page)
 *  - A short code (8-char manual entry)
 *
 * This function normalises all variants to the bare token.
 */
function extractToken(raw: string): string {
  // Full URL → extract last path segment
  const scanPathMatch = raw.match(/\/api\/scan\/([^/?#]+)/);
  if (scanPathMatch) return decodeURIComponent(scanPathMatch[1]);
  // Already a bare token
  return raw;
}

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

  const { token: rawToken } = await params;
  const scanToken = extractToken(rawToken);

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
  logger.info({ ctx: 'scan', rid: restaurantId, msg: `raw="${rawToken}" extracted="${scanToken}"` });

  const { customer, resolvedBy, resolvedPassId } = await resolveScanToken(scanToken, restaurantId);

  logger.info({ ctx: 'scan', rid: restaurantId, msg: `token="${scanToken}" resolvedBy="${resolvedBy}" passId=${resolvedPassId ?? 'none'}` });

  if (!customer) {
    logger.warn({ ctx: 'scan', rid: restaurantId, msg: `NOT FOUND — token="${scanToken}" len=${scanToken.length}` });
    return Response.json({ error: t('api.customerNotFound') }, { status: 404 });
  }

  // ── Loyalty config ────────────────────────────────────────────────────
  const { data: settings } = await supabaseAdmin
    .from('loyalty_settings')
    .select('points_per_scan, reward_threshold, reward_message, program_type, stamps_total, max_scans_per_day, min_scan_delay_minutes, notify_reward_reached, notify_near_reward')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const programType     = settings?.program_type ?? 'points';
  const stampsTotal     = settings?.stamps_total ?? 10;

  // ── Resolve target pass (per-pass counters) ─────────────────────────
  const targetPass = await resolveTargetPass(resolvedPassId, customer.id, restaurantId, programType);

  // ── Anti-fraud checks ──────────────────────────────────────────────
  const maxScans = settings?.max_scans_per_day ?? 0;
  const minDelay = settings?.min_scan_delay_minutes ?? 0;

  if (maxScans > 0 || minDelay > 0) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: recentScans } = await supabaseAdmin
      .from('scan_events')
      .select('created_at')
      .eq('customer_id', customer.id)
      .eq('restaurant_id', restaurantId)
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false });

    // Max scans per day
    if (maxScans > 0 && recentScans && recentScans.length >= maxScans) {
      return Response.json(
        { error: t('api.maxScansReached') },
        { status: 429 },
      );
    }

    // Min delay between scans
    if (minDelay > 0 && recentScans && recentScans.length > 0) {
      const lastScanTime = new Date(recentScans[0].created_at).getTime();
      const elapsed = (Date.now() - lastScanTime) / 60_000; // minutes
      if (elapsed < minDelay) {
        const remaining = Math.ceil(minDelay - elapsed);
        return Response.json(
          { error: t('api.scanTooSoon', { minutes: remaining }) },
          { status: 429 },
        );
      }
    }
  }

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

  // ── Point multiplier check (Pro feature) ─────────────────────────────
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun, 6=Sat
  const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
  const { data: multipliers } = await supabaseAdmin
    .from('point_multipliers')
    .select('multiplier, day_of_week, start_time, end_time')
    .eq('restaurant_id', restaurantId)
    .eq('active', true);

  if (multipliers && multipliers.length > 0) {
    for (const m of multipliers) {
      const dayMatch = m.day_of_week === null || m.day_of_week === currentDay;
      const timeMatch = (!m.start_time || currentTime >= m.start_time) && (!m.end_time || currentTime <= m.end_time);
      if (dayMatch && timeMatch) {
        pointsToAdd = Math.round(pointsToAdd * (m.multiplier ?? 1));
        break; // apply first matching multiplier only
      }
    }
  }

  // Capture pre-scan balances — use pass-level when available, else customer-level (legacy)
  const balanceBefore   = targetPass?.total_points ?? customer.total_points;
  const stampsBefore    = targetPass?.stamps_count ?? customer.stamps_count ?? 0;
  const currentStamps   = stampsBefore;
  const isRewardPending = targetPass?.reward_pending ?? customer.reward_pending ?? false;

  // ── Reward redemption: if reward is pending, this scan collects it ────
  // Points : les points sont une MONNAIE — la récolte déduit le seuil
  // (74/30 → récolte → 44) et re-signale s'il reste ≥ seuil.
  // Stamps : reset à 0 (le trigger DB incrémente completed_cards).
  if (isRewardPending) {
    const redeemThreshold = settings?.reward_threshold ?? 100;
    const isPointsMode = programType === 'points';
    const pointsRedeemDelta = isPointsMode ? -Math.min(redeemThreshold, balanceBefore) : 0;
    const resetDelta = isPointsMode ? 0 : -currentStamps;
    const { error: redeemErr } = await supabaseAdmin.from('transactions').insert({
      restaurant_id:  restaurantId,
      customer_id:    customer.id,
      wallet_pass_id: targetPass?.id ?? null,
      type:           'reward_redeem',
      points_delta:   pointsRedeemDelta,
      stamps_delta:   resetDelta,
      balance_after:  balanceBefore + pointsRedeemDelta,
      metadata:       { reason: 'Récompense récoltée' },
    });

    if (redeemErr) {
      logger.error({ ctx: 'scan', rid: restaurantId, msg: 'reward redeem insert failed', err: redeemErr.message });
      return Response.json({ error: t('api.scanError') }, { status: 500 });
    }

    // Points : re-signale immédiatement si le solde restant couvre encore le
    // seuil ; incrémente completed_cards explicitement (trigger = stamps only).
    const remainingAfterRedeem = balanceBefore + pointsRedeemDelta;
    const stillPending = isPointsMode && redeemThreshold > 0 && remainingAfterRedeem >= redeemThreshold;
    if (targetPass) {
      await supabaseAdmin.from('wallet_passes')
        .update({ reward_pending: stillPending })
        .eq('id', targetPass.id);
    }
    await supabaseAdmin.from('customers')
      .update({ reward_pending: stillPending })
      .eq('id', customer.id);
    if (isPointsMode) {
      const { data: cc } = await supabaseAdmin.from('customers')
        .select('completed_cards').eq('id', customer.id).maybeSingle();
      await supabaseAdmin.from('customers')
        .update({ completed_cards: (cc?.completed_cards ?? 0) + 1 })
        .eq('id', customer.id);
    }

    // Re-read balances after reset — from pass if available, else customer
    const { data: freshRedeemPass } = targetPass
      ? await supabaseAdmin
          .from('wallet_passes')
          .select('total_points, stamps_count')
          .eq('id', targetPass.id)
          .maybeSingle()
      : { data: null };

    const { data: freshRedeem } = await supabaseAdmin
      .from('customers')
      .select('total_points, stamps_count')
      .eq('id', customer.id)
      .maybeSingle();

    const redeemPoints = freshRedeemPass?.total_points ?? freshRedeem?.total_points ?? balanceBefore;
    const redeemStamps = freshRedeemPass?.stamps_count ?? freshRedeem?.stamps_count ?? 0;

    const responsePayload = {
      success: true,
      program_type: programType,
      pass_id: targetPass?.id ?? null,
      customer: {
        id:           customer.id,
        first_name:   customer.first_name,
        last_name:    customer.last_name,
        total_points: redeemPoints,
        stamps_count: redeemStamps,
      },
      points_added:         0,
      reward_triggered:     false,
      reward_redeemed:      true,
      reward_still_pending: stillPending,
      stamps_added:         0,
      stamps_total:         stampsTotal,
      stamp_card_completed: false,
      reward_message: settings?.reward_message ?? t('api.defaultReward'),
      scan_action_label: null,
    };

    // Insert scan_events audit row for the redemption
    const scanEventInsert = {
      restaurant_id:       restaurantId,
      customer_id:         customer.id,
      wallet_pass_id:      targetPass?.id ?? null,
      idempotency_key:     idempotencyKey,
      resolved_by:         resolvedBy,
      points_awarded:      0,
      stamps_delta:        resetDelta,
      balance_before:      balanceBefore,
      balance_after:       redeemPoints,
      stamps_before:       stampsBefore,
      stamps_after:        redeemStamps,
      program_type:        programType,
      reward_triggered:    false,
      stamp_card_completed: false,
      scanner_user_id:     scannerUserId,
      response_cache:      responsePayload,
    };

    const { data: scanEvent } = await supabaseAdmin
      .from('scan_events').insert(scanEventInsert).select('id').single();

    // Wallet sync + APNS push
    const { data: redeemQueueItem } = await supabaseAdmin.from('wallet_sync_queue').insert({
      scan_event_id: scanEvent?.id ?? null,
      customer_id:   customer.id,
      restaurant_id: restaurantId,
    }).select('id').single();
    try {
      const { data: applePasses } = await supabaseAdmin
        .from('wallet_passes').select('id')
        .eq('customer_id', customer.id).eq('platform', 'apple').eq('status', 'active');
      if (applePasses?.length) {
        await Promise.allSettled(applePasses.map(pass => pushPassUpdate(pass.id)));
      }
    } catch (err) {
      logger.error({ ctx: 'scan', rid: restaurantId, msg: 'APNS push failed', err: err instanceof Error ? err.message : String(err) });
    }
    // Parité Android : solde Google rafraîchi immédiatement (le cron nocturne
    // reste le filet de rattrapage en cas d'échec).
    await syncGooglePassesNow(customer.id, restaurantId, redeemQueueItem?.id ?? null);

    return Response.json(responsePayload);
  }

  // ── Normal scan flow ──────────────────────────────────────────────────
  const newBalance = balanceBefore + pointsToAdd;

  // Points-mode reward
  const rewardThreshold = settings?.reward_threshold ?? 100;
  const rewardTriggered = programType === 'points'
    && rewardThreshold > 0
    && newBalance >= rewardThreshold;

  // Stamps-mode completion (pointsToAdd acts as stamps count in stamps mode)
  const stampsToAdd        = programType === 'stamps' ? pointsToAdd : 0;
  const stampCardCompleted = programType === 'stamps' && (currentStamps + stampsToAdd) >= stampsTotal;
  // When card completes: DON'T reset stamps. Keep at max for reward card display.
  // Stamps will be reset on the next scan (reward redemption above).
  const stampsDelta    = programType !== 'stamps' ? 0
    : stampCardCompleted ? (stampsTotal - currentStamps)  // cap at stampsTotal
    : stampsToAdd;

  // ── Transaction insert (DB trigger atomically updates customer + pass) ──
  const { error: insertError } = await supabaseAdmin.from('transactions').insert({
    restaurant_id:  restaurantId,
    customer_id:    customer.id,
    wallet_pass_id: targetPass?.id ?? null,
    type:           'visit',
    points_delta:   pointsToAdd,
    stamps_delta:   stampsDelta,
    balance_after:  newBalance,
    metadata:       {
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

  // Récompense atteinte (points) ou carte complétée (stamps) → flag pending
  if (stampCardCompleted || rewardTriggered) {
    if (targetPass) {
      await supabaseAdmin.from('wallet_passes')
        .update({ reward_pending: true })
        .eq('id', targetPass.id);
    }
    await supabaseAdmin.from('customers')
      .update({ reward_pending: true })
      .eq('id', customer.id);
  }

  // ── Re-read actual post-trigger balances (concurrency-safe) ───────────
  // Prefer pass-level counters when available
  const { data: freshPass } = targetPass
    ? await supabaseAdmin
        .from('wallet_passes')
        .select('total_points, stamps_count')
        .eq('id', targetPass.id)
        .maybeSingle()
    : { data: null };

  const { data: fresh } = await supabaseAdmin
    .from('customers')
    .select('total_points, stamps_count')
    .eq('id', customer.id)
    .maybeSingle();

  const actualBalance = freshPass?.total_points ?? fresh?.total_points ?? newBalance;
  const actualStamps  = freshPass?.stamps_count ?? fresh?.stamps_count ?? (currentStamps + stampsDelta);

  // ── Build response payload ────────────────────────────────────────────
  const responsePayload = {
    success: true,
    program_type: programType,
    pass_id: targetPass?.id ?? null,
    customer: {
      id:           customer.id,
      first_name:   customer.first_name,
      last_name:    customer.last_name,
      total_points: actualBalance,
      stamps_count: actualStamps,
    },
    points_added:         pointsToAdd,
    reward_triggered:     rewardTriggered,
    reward_redeemed:      false,
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
    wallet_pass_id:      targetPass?.id ?? null,
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
  const { data: queueItem, error: syncErr } = await supabaseAdmin.from('wallet_sync_queue').insert({
    scan_event_id: scanEvent?.id ?? null,
    customer_id:   customer.id,
    restaurant_id: restaurantId,
  }).select('id').single();
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

  // Parité Android : solde Google rafraîchi immédiatement (le cron nocturne
  // reste le filet de rattrapage en cas d'échec).
  await syncGooglePassesNow(customer.id, restaurantId, queueItem?.id ?? null);

  // ── Auto-notifications (fire-and-forget, never blocks response) ─────
  if (customer.email) {
    const { data: resto } = await supabaseAdmin
      .from('restaurants').select('name, primary_color').eq('id', restaurantId).single();

    if (resto) {
      const rewardThreshold = settings?.reward_threshold ?? 100;
      const nearThreshold = programType === 'stamps'
        ? stampsTotal - 1
        : rewardThreshold - (settings?.points_per_scan ?? 1);
      const currentBalance = programType === 'stamps' ? actualStamps : actualBalance;

      // Reward reached notification
      if (settings?.notify_reward_reached && (rewardTriggered || stampCardCompleted)) {
        sendRewardReachedEmail({
          to: customer.email,
          firstName: customer.first_name,
          restaurantName: resto.name,
          restaurantColor: resto.primary_color ?? '#4f6bed',
          rewardMessage: settings.reward_message ?? t('api.defaultReward'),
        }).catch(err => logger.error({ ctx: 'scan/notify', rid: restaurantId, msg: 'reward email failed', err }));
      }

      // Near reward notification (only if just crossed the threshold)
      if (settings?.notify_near_reward && !rewardTriggered && !stampCardCompleted) {
        const prevBalance = programType === 'stamps' ? stampsBefore : balanceBefore;
        if (prevBalance < nearThreshold && currentBalance >= nearThreshold) {
          sendNearRewardEmail({
            to: customer.email,
            firstName: customer.first_name,
            restaurantName: resto.name,
            restaurantColor: resto.primary_color ?? '#4f6bed',
            currentPoints: currentBalance,
            threshold: programType === 'stamps' ? stampsTotal : rewardThreshold,
            programType,
          }).catch(err => logger.error({ ctx: 'scan/notify', rid: restaurantId, msg: 'near-reward email failed', err }));
        }
      }
    }
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

  // allowStaff : un membre d'équipe (staff d'un café) doit pouvoir identifier
  // un client au scanner. Le POST (crédit) accepte déjà le staff via
  // requireScannerAuth ; on aligne le GET (identification).
  const guard = await requireAuth(req, { allowStaff: true });
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return Response.json({ error: tGet('api.restaurantNotFound') }, { status: 404 });
  }

  const { token: rawGetToken } = await params;
  const scanToken = extractToken(rawGetToken);

  logger.info({ ctx: 'scan-get', rid: guard.restaurantId, msg: `raw="${rawGetToken}" extracted="${scanToken}"` });

  // Use the same 3-tier resolution as POST (qr_token → id → short_code)
  const { customer, resolvedBy } = await resolveScanToken(scanToken, guard.restaurantId);

  logger.info({ ctx: 'scan-get', rid: guard.restaurantId, msg: `token="${scanToken}" resolvedBy="${resolvedBy}"` });

  if (!customer) {
    logger.warn({ ctx: 'scan-get', rid: guard.restaurantId, msg: `NOT FOUND — token="${scanToken}" len=${scanToken.length}` });
    return Response.json({ error: tGet('api.customerNotFound') }, { status: 404 });
  }

  return Response.json({ customer });
}
