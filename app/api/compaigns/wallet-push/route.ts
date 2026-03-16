// app/api/compaigns/wallet-push/route.ts
//
// Sends a marketing notification to Apple Wallet pass holders.
// Updates promo_message on targeted wallet_passes, then triggers APNS push
// so iOS re-downloads the pass and shows a lock-screen notification.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireFeature } from '@/lib/server-auth';
import { pushPassUpdate } from '@/lib/apns';
import { checkPlanLimit, planLimitError } from '@/lib/plan-limits';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';

const CTX = 'campaigns/wallet-push';

export async function POST(req: Request) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 });
  }

  // Feature gate: wallet_apple required
  const featureGate = requireFeature(guard, 'wallet_apple', 'Apple Wallet');
  if (featureGate) return featureGate;

  // Plan limit: counts toward same monthly campaign quota
  const { allowed, limit, current } = await checkPlanLimit(guard.restaurantId, guard.plan, 'campaigns');
  if (!allowed) {
    return Response.json(planLimitError('campaigns', current, limit), { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, message, segment } = body as {
    name?: string;
    message?: string;
    segment?: string;
  };

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Nom de campagne requis' }, { status: 400 });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return Response.json({ error: 'Message requis' }, { status: 400 });
  }
  if (message.length > 300) {
    return Response.json({ error: 'Message trop long (300 caractères max)' }, { status: 400 });
  }

  const seg = segment ?? 'all';

  // ── Fetch restaurant ────────────────────────────────────────────────────
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name')
    .eq('id', guard.restaurantId)
    .single();
  if (!restaurant) {
    return Response.json({ error: 'Restaurant introuvable' }, { status: 404 });
  }

  // ── Fetch loyalty settings (for VIP / near_reward thresholds) ───────────
  const { data: loyaltySettings } = await supabaseAdmin
    .from('loyalty_settings')
    .select('program_type, vip_threshold_points, vip_threshold_stamps, reward_threshold')
    .eq('restaurant_id', restaurant.id)
    .maybeSingle();

  const programType = loyaltySettings?.program_type ?? 'points';
  const vipThreshold = programType === 'stamps'
    ? (loyaltySettings?.vip_threshold_stamps ?? 10)
    : (loyaltySettings?.vip_threshold_points ?? 100);
  const rewardThreshold = loyaltySettings?.reward_threshold ?? 100;

  // ── Fetch all customers ─────────────────────────────────────────────────
  const { data: allCustomers } = await supabaseAdmin
    .from('customers')
    .select('id, total_points, stamps_count, last_visit_at, birth_date')
    .eq('restaurant_id', restaurant.id);

  const customers = allCustomers ?? [];
  const now = Date.now();

  // ── Apply segment filter ────────────────────────────────────────────────
  const targetCustomerIds = customers
    .filter(c => {
      switch (seg) {
        case 'inactive_45':
          return !c.last_visit_at || (now - new Date(c.last_visit_at).getTime()) > 45 * 86400000;
        case 'birthday': {
          if (!c.birth_date) return false;
          const b = new Date(c.birth_date);
          const today = new Date();
          const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
          const in7 = new Date(); in7.setDate(today.getDate() + 7);
          return next >= today && next <= in7;
        }
        case 'near_reward':
          return c.total_points >= (rewardThreshold * 0.8) && c.total_points < rewardThreshold;
        case 'active':
          return c.last_visit_at && (now - new Date(c.last_visit_at).getTime()) < 30 * 86400000;
        case 'vip':
          if (programType === 'stamps') return (c.stamps_count ?? 0) >= vipThreshold;
          return c.total_points >= vipThreshold;
        case 'all':
        default:
          return true;
      }
    })
    .map(c => c.id);

  if (targetCustomerIds.length === 0) {
    return Response.json({ error: 'Aucun client dans ce segment' }, { status: 400 });
  }

  // ── Find active Apple passes for targeted customers ─────────────────────
  const { data: passes } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, customer_id')
    .eq('restaurant_id', restaurant.id)
    .eq('platform', 'apple')
    .eq('status', 'active')
    .in('customer_id', targetCustomerIds);

  if (!passes?.length) {
    return Response.json({ error: 'Aucun porteur Apple Wallet dans ce segment' }, { status: 400 });
  }

  // ── Update promo_message on all targeted passes ─────────────────────────
  const passIds = passes.map(p => p.id);
  const { error: updateErr } = await supabaseAdmin
    .from('wallet_passes')
    .update({ promo_message: message.trim() })
    .in('id', passIds);

  if (updateErr) {
    logger.error({ ctx: CTX, rid: restaurant.id, msg: 'Failed to update promo_message', err: updateErr });
    return Response.json({ error: 'Erreur mise à jour des passes' }, { status: 500 });
  }

  // ── Save campaign record ────────────────────────────────────────────────
  const { data: campaign, error: campErr } = await supabaseAdmin
    .from('campaigns')
    .insert({
      restaurant_id: restaurant.id,
      name: name.trim(),
      type: 'wallet_push',
      subject: 'Notification Wallet',
      body: message.trim(),
      segment: seg,
      status: 'sending',
      recipients_count: passes.length,
    })
    .select()
    .single();

  if (campErr) {
    logger.error({ ctx: CTX, rid: restaurant.id, msg: 'Failed to insert campaign', err: campErr });
  }

  // ── Send APNS push to each pass ─────────────────────────────────────────
  let pushed = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    passIds.map(async (passId) => {
      const pushResults = await pushPassUpdate(passId);
      const anySuccess = pushResults.some(r => r.success);
      if (anySuccess) pushed++;
      else if (pushResults.length > 0) failed++;
      // passes with 0 registrations are silently skipped (no device registered yet)
    }),
  );

  // Count unhandled rejections as failures
  for (const r of results) {
    if (r.status === 'rejected') failed++;
  }

  // ── Update campaign status ──────────────────────────────────────────────
  if (campaign) {
    await supabaseAdmin
      .from('campaigns')
      .update({
        status: failed === passes.length ? 'failed' : 'sent',
        sent_at: new Date().toISOString(),
        recipients_count: pushed,
      })
      .eq('id', campaign.id);
  }

  // ── Audit log ───────────────────────────────────────────────────────────
  auditLog({
    restaurantId: restaurant.id,
    actorId: guard.userId,
    action: 'campaign_wallet_push',
    targetType: 'campaign',
    targetId: campaign?.id ?? 'unknown',
    metadata: {
      name: name.trim(),
      segment: seg,
      message: message.trim(),
      passes: passes.length,
      pushed,
      failed,
    },
  });

  logger.info({
    ctx: CTX,
    rid: restaurant.id,
    msg: `Wallet push campaign sent: ${pushed} pushed, ${failed} failed out of ${passes.length} passes`,
  });

  return Response.json({
    success: true,
    campaign_id: campaign?.id ?? null,
    passes: passes.length,
    pushed,
    failed,
  });
}
