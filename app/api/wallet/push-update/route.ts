// app/api/wallet/push-update/route.ts
//
// Triggers Apple Wallet push notifications for a customer's active passes.
// Called from the dashboard after manual point/stamp adjustments.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';
import { pushPassUpdate } from '@/lib/apns';
import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;

  const { restaurantId } = guard;
  if (!restaurantId) {
    return Response.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const customerId: string | undefined = body.customer_id;

  if (!customerId || typeof customerId !== 'string') {
    return Response.json({ error: 'customer_id is required' }, { status: 400 });
  }

  // Verify the customer belongs to this restaurant (tenant isolation)
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!customer) {
    return Response.json({ error: 'Customer not found' }, { status: 404 });
  }

  // Find active Apple passes with push tokens for this customer
  const { data: applePasses } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, push_token')
    .eq('customer_id', customerId)
    .eq('platform', 'apple')
    .eq('status', 'active')
    .not('push_token', 'is', null);

  if (!applePasses?.length) {
    return Response.json({ pushed: 0 });
  }

  let pushed = 0;
  let failed = 0;

  await Promise.allSettled(applePasses.map(async (pass) => {
    try {
      await pushPassUpdate(pass.push_token!);
      pushed++;
    } catch (err) {
      failed++;
      logger.error({
        ctx: 'wallet/push-update',
        rid: restaurantId,
        msg: 'APNS push failed',
        passId: pass.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }));

  return Response.json({ pushed, failed });
}
