import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';
import {
  ensureLoyaltyClass,
  recoverLoyaltyObject,
  type GooglePassData,
} from '@/lib/google-wallet';

/*
 * POST /api/wallet/passes/recover
 *
 * Safe recovery endpoint for Google Wallet passes that failed at issuance.
 *
 * Detects:   wallet_passes WHERE platform='google' AND status='active' AND sync_error IS NOT NULL
 * Strategy:  ensureLoyaltyClass (sequential) → recoverLoyaltyObject (GET→patch or GET→create)
 * Audit:     DB history is never deleted; sync_error is cleared only on confirmed success.
 * Idempotent: safe to call multiple times; already-recovered passes are simply absent from results.
 *
 * Body (optional):
 *   { passIds?: string[] }   // omit to recover ALL affected passes for this restaurant
 *
 * Response:
 *   { recovered: number, failed: number, skipped: number, results: RecoveryResult[] }
 */

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID!;

interface RecoverBody {
  passIds?: string[];
}

type RecoveryStrategy = 'already_active' | 'patched' | 'created';

interface RecoveryResult {
  passId:    string;
  status:    'recovered' | 'failed' | 'skipped';
  strategy?: RecoveryStrategy;
  reason?:   string;
  error?:    string;
}

export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  let body: RecoverBody = {};
  try { body = await request.json(); } catch { /* empty body = recover all affected passes */ }

  // ── Fetch restaurant ──────────────────────────────────────────────────────
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color, logo_url')
    .eq('id', guard.restaurantId)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  // ── Find affected passes ──────────────────────────────────────────────────
  // Affected = active Google passes that have a sync_error (class-or-object creation failed)
  let passQuery = supabaseAdmin
    .from('wallet_passes')
    .select('id, object_id, template_id, customer_id, pass_version')
    .eq('restaurant_id', guard.restaurantId)
    .eq('platform', 'google')
    .eq('status', 'active')
    .not('sync_error', 'is', null);

  if (body.passIds?.length) {
    passQuery = passQuery.in('id', body.passIds);
  }

  const { data: passes, error: passErr } = await passQuery;
  if (passErr) {
    return NextResponse.json({ error: passErr.message }, { status: 500 });
  }

  if (!passes?.length) {
    return NextResponse.json({ recovered: 0, failed: 0, skipped: 0, results: [] });
  }

  // ── Batch-fetch related data (avoid N+1 queries) ──────────────────────────
  const templateIds = [...new Set(passes.map(p => p.template_id).filter(Boolean) as string[])];
  const customerIds = [...new Set(passes.map(p => p.customer_id).filter(Boolean) as string[])];

  const [
    { data: loyaltySettings },
    { data: templates },
    { data: customers },
  ] = await Promise.all([
    supabaseAdmin
      .from('loyalty_settings')
      .select('stamps_total, reward_threshold, reward_message')
      .eq('restaurant_id', guard.restaurantId)
      .maybeSingle(),
    supabaseAdmin
      .from('wallet_pass_templates')
      .select('id, pass_kind, config_json, primary_color')
      .in('id', templateIds),
    supabaseAdmin
      .from('customers')
      .select('id, first_name, last_name, qr_token, stamps_count, total_points')
      .in('id', customerIds),
  ]);

  const templateMap = Object.fromEntries((templates ?? []).map(t => [t.id, t]));
  const customerMap = Object.fromEntries((customers ?? []).map(c => [c.id, c]));

  // ── Process each affected pass sequentially ───────────────────────────────
  const results: RecoveryResult[] = [];
  let recovered = 0;
  let failed    = 0;
  let skipped   = 0;

  for (const pass of passes) {
    // object_id is always set on insert, but guard defensively
    if (!pass.object_id) {
      results.push({ passId: pass.id, status: 'skipped', reason: 'object_id manquant' });
      skipped++;
      continue;
    }

    const template = templateMap[pass.template_id];
    const customer = customerMap[pass.customer_id];

    if (!template || !customer) {
      results.push({ passId: pass.id, status: 'skipped', reason: 'template ou client introuvable' });
      skipped++;
      continue;
    }

    const passKind     = template.pass_kind as 'stamps' | 'points' | 'event';
    const classId      = `${ISSUER_ID}.r${guard.restaurantId!.replace(/-/g, '')}_${passKind}`;
    const primaryColor = template.primary_color ?? restaurant.primary_color ?? '#4f6bed';

    // Merge template config with loyalty_settings overrides (same pattern as issuance)
    const resolvedConfig: Record<string, unknown> = {
      ...((template.config_json as Record<string, unknown>) ?? {}),
      ...(loyaltySettings ? {
        stamps_total:     loyaltySettings.stamps_total,
        reward_threshold: loyaltySettings.reward_threshold,
        reward_message:   loyaltySettings.reward_message,
      } : {}),
    };

    const passData: GooglePassData = {
      objectId:        pass.object_id,
      classId,
      customerId:      customer.id,
      displayName:     `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
      totalPoints:     customer.total_points ?? 0,
      stampsCount:     customer.stamps_count ?? 0,
      stampsTotal:     Number(resolvedConfig.stamps_total     ?? 10),
      rewardThreshold: Number(resolvedConfig.reward_threshold ?? 100),
      rewardMessage:   String(resolvedConfig.reward_message   ?? 'Récompense offerte !'),
      qrToken:         customer.qr_token ?? customer.id,
      restaurantName:  restaurant.name,
      primaryColor,
      passKind,
    };

    // ── Step 1: ensure LoyaltyClass exists (prerequisite for object) ──────
    const classResult = await ensureLoyaltyClass({
      classId,
      restaurantName: restaurant.name,
      primaryColor,
      passKind,
      logoUrl:        restaurant.logo_url,
    });

    if (!classResult.ok) {
      // Update sync_error to reflect the new failure reason (preserves audit trail)
      await supabaseAdmin
        .from('wallet_passes')
        .update({ sync_error: 'Recovery failed: class creation error' })
        .eq('id', pass.id);

      results.push({ passId: pass.id, status: 'failed', error: 'class creation failed' });
      failed++;
      continue;
    }

    // ── Step 2: recover the LoyaltyObject ────────────────────────────────
    // recoverLoyaltyObject will: GET → ACTIVE=already_active, non-ACTIVE→patch, 404→create
    const recovery = await recoverLoyaltyObject(passData);

    if (!recovery.ok) {
      await supabaseAdmin
        .from('wallet_passes')
        .update({ sync_error: `Recovery failed: ${recovery.error ?? 'object error'}` })
        .eq('id', pass.id);

      results.push({ passId: pass.id, status: 'failed', error: recovery.error });
      failed++;
      continue;
    }

    // ── Step 3: mark pass as recovered ───────────────────────────────────
    // Clear sync_error only on confirmed success. Increment pass_version (lifecycle mutation).
    // DB history row is preserved — we never insert a replacement row.
    await supabaseAdmin
      .from('wallet_passes')
      .update({
        sync_error:     null,
        last_synced_at: new Date().toISOString(),
        pass_version:   (pass.pass_version ?? 1) + 1,
      })
      .eq('id', pass.id);

    results.push({ passId: pass.id, status: 'recovered', strategy: recovery.strategy as RecoveryStrategy });
    recovered++;
  }

  return NextResponse.json({ recovered, failed, skipped, results });
}
