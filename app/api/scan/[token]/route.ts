// app/api/scan/[token]/route.ts
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireScannerAuth } from '@/lib/server-auth';
import { NextResponse } from 'next/server';
import { updateLoyaltyObject } from '@/lib/google-wallet';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // IP-based rate limit
  const ip = getClientIp(req);
  if (!scanLimiter.check(ip).success) {
    return Response.json(
      { error: 'Trop de scans. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  // Accepts both the owner Supabase session (dashboard) and X-Scanner-Token (cashier).
  const guard = await requireScannerAuth(req);
  if (guard instanceof NextResponse) return guard;
  const { restaurantId } = guard;

  const { token: scanToken } = await params;

  const { customer, resolvedBy } = await resolveScanToken(scanToken, restaurantId);

  console.log(`[scan/POST] token="${scanToken}" resolvedBy="${resolvedBy}"`);

  if (!customer) {
    return Response.json({ error: 'Client introuvable' }, { status: 404 });
  }

  // Loyalty config
  const { data: settings } = await supabaseAdmin
    .from('loyalty_settings')
    .select('points_per_scan, reward_threshold, reward_message, program_type, stamps_total')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const programType     = settings?.program_type ?? 'points';
  const stampsTotal     = settings?.stamps_total ?? 10;
  const pointsToAdd     = settings?.points_per_scan ?? 1;
  const newBalance      = customer.total_points + pointsToAdd;

  // Points-mode reward: fires once when the cumulative threshold is crossed.
  // Scoped to 'points' mode only — stamps mode uses stampCardCompleted below.
  const rewardThreshold = settings?.reward_threshold ?? 100;
  const rewardTriggered = programType === 'points'
    && customer.total_points < rewardThreshold
    && newBalance >= rewardThreshold;

  // Stamps-mode completion:
  //   currentStamps + 1 >= stampsTotal  →  card is full, reset to 0.
  //
  // stamps_delta encoding:
  //   Normal scan:      +1                  → stamps_count goes N → N+1
  //   Completing scan:  1 - stampsTotal     → stamps_count goes (stampsTotal-1) → 0
  //     e.g. 9 + (1-10) = 0  ✓
  //
  // DB trigger reads stamps_delta and applies it atomically, so stamps_count
  // can never go past stampsTotal regardless of concurrent requests.
  const currentStamps      = customer.stamps_count ?? 0;
  const stampCardCompleted = programType === 'stamps' && (currentStamps + 1) >= stampsTotal;
  // stamps_delta encoding:
  //   Normal scan:     +1             → stamps_count goes N → N+1
  //   Completing scan: 1 - total      → stamps_count goes (total-1) → 0
  //     e.g. total=10 → delta=-9 → 9 + (-9) = 0  ✓
  // The trigger auto-detects completion from this negative delta and increments
  // customers.completed_cards in the same atomic UPDATE (migration 002).
  const stampsDelta    = programType !== 'stamps' ? 0
    : stampCardCompleted ? (1 - stampsTotal)
    : 1;
  const newStampsCount = currentStamps + stampsDelta; // 0 on completion, N+1 otherwise

  // Transaction insert — the DB trigger trg_update_customer_after_transaction
  // atomically updates total_points, stamps_count, completed_cards,
  // last_visit_at, and total_visits. No cards_completed column on transactions
  // needed — the trigger infers completion from the sign of stamps_delta.
  const { error: insertError } = await supabaseAdmin.from('transactions').insert({
    restaurant_id: restaurantId,
    customer_id:   customer.id,
    type:          'visit',
    points_delta:  pointsToAdd,
    stamps_delta:  stampsDelta,
    balance_after: newBalance,
    metadata:      { reason: 'Scan caisse' },
  });

  if (insertError) {
    console.error('[scan/POST] transaction insert failed:', insertError.message);
    return Response.json(
      { error: 'Erreur lors de l\'enregistrement du scan. Réessayez.' },
      { status: 500 },
    );
  }

  // Fire-and-forget: sync active Google passes — never blocks the scan response
  void (async () => {
    const { data: googlePasses } = await supabaseAdmin
      .from('wallet_passes')
      .select('id, object_id')
      .eq('customer_id', customer.id)
      .eq('platform', 'google')
      .eq('status', 'active')
      .not('object_id', 'is', null);

    if (!googlePasses?.length) return;

    // Re-read the customer's actual post-trigger values from DB.
    // The DB trigger runs atomically after the transaction insert, so by the time
    // we reach here the correct stamps/points are already committed. Using the
    // freshly-read values prevents a race condition where two concurrent scans
    // both compute the same app-side newStampsCount and write a stale value to
    // Google Wallet (e.g. both send 6 while the DB correctly wrote 7).
    const { data: freshCustomer } = await supabaseAdmin
      .from('customers')
      .select('total_points, stamps_count')
      .eq('id', customer.id)
      .maybeSingle();

    const syncPoints = freshCustomer?.total_points ?? newBalance;
    const syncStamps = freshCustomer?.stamps_count ?? newStampsCount;

    await Promise.allSettled(googlePasses.map(async (p) => {
      console.log(
        `[GWallet/scan] objectId=${p.object_id} customer=${customer.id}` +
        ` stamps_before=${customer.stamps_count} stamps_after=${syncStamps}` +
        ` points_before=${customer.total_points} points_after=${syncPoints}` +
        ` passKind=${programType}`,
      );

      const result = await updateLoyaltyObject(p.object_id!, {
        passKind:    programType as 'stamps' | 'points',
        totalPoints: syncPoints,
        stampsCount: syncStamps,
        stampsTotal: settings?.stamps_total ?? 10,
      });

      console.log(
        `[GWallet/scan] objectId=${p.object_id} GW_response: ok=${result.ok} HTTP ${result.status}` +
        (!result.ok ? ` error=${result.error ?? JSON.stringify(result.data).slice(0, 200)}` : ''),
      );

      await supabaseAdmin
        .from('wallet_passes')
        .update({
          last_synced_at: result.ok ? new Date().toISOString() : undefined,
          sync_error:     result.ok ? null : (result.error ?? 'Scan sync failed'),
        })
        .eq('id', p.id);
    }));
  })().catch((err) => {
    console.error('[GWallet/scan] wallet sync unhandled error:', err instanceof Error ? err.message : String(err));
  });

  return Response.json({
    success: true,
    program_type: programType,             // 'points' | 'stamps' — UI picks labels from this
    customer: {
      id:           customer.id,
      first_name:   customer.first_name,
      last_name:    customer.last_name,
      total_points: newBalance,            // lifetime scan counter (both modes)
      stamps_count: newStampsCount,        // 0 after completion, N+1 on normal stamp scan
    },
    // Points mode signals
    points_added:         pointsToAdd,
    reward_triggered:     rewardTriggered, // true once, when crossing reward_threshold
    // Stamps mode signals
    stamps_added:         stampsDelta > 0 ? stampsDelta : 0, // 1 on normal scan, 0 on reset
    stamps_total:         stampsTotal,
    stamp_card_completed: stampCardCompleted, // true when the card is full and reset
    // Shared
    reward_message: settings?.reward_message ?? 'Récompense offerte !',
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 });
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

  return Response.json({ error: 'Client introuvable' }, { status: 404 });
}
