// app/api/cron/wallet-sync/route.ts
//
// Automatic retry cron for failed Google Wallet syncs.
// Runs every 6 hours via Vercel Cron.  Secured with CRON_SECRET.
//
// Targets: active Google passes WHERE sync_error IS NOT NULL AND object_id IS NOT NULL
// For each: fetches live customer data → calls updateLoyaltyObject() → clears or updates sync_error.
// Capped at MAX_RETRY passes per run to stay within Vercel serverless timeout.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateLoyaltyObject } from '@/lib/google-wallet';

const MAX_RETRY = 50;

export async function GET(req: Request) {
  // Verify Vercel Cron secret
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch active Google passes that have a recorded sync failure
  const { data: failedPasses, error: fetchErr } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, object_id, restaurant_id, customer_id, wallet_pass_templates(pass_kind)')
    .eq('platform', 'google')
    .eq('status', 'active')
    .not('object_id', 'is', null)
    .not('sync_error', 'is', null)
    .limit(MAX_RETRY);

  if (fetchErr) {
    console.error('[cron/wallet-sync] fetch failed:', fetchErr.message);
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!failedPasses?.length) {
    return Response.json({ retried: 0, succeeded: 0, failed: 0 });
  }

  let succeeded = 0;
  let failed    = 0;

  await Promise.allSettled(failedPasses.map(async (pass) => {
    // Fetch live customer loyalty data
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('total_points, stamps_count')
      .eq('id', pass.customer_id)
      .maybeSingle();

    if (!customer) { failed++; return; }

    const passKind = (pass.wallet_pass_templates as unknown as { pass_kind: string } | null)?.pass_kind ?? 'points';

    const { data: settings } = await supabaseAdmin
      .from('loyalty_settings')
      .select('stamps_total')
      .eq('restaurant_id', pass.restaurant_id)
      .maybeSingle();

    const result = await updateLoyaltyObject(pass.object_id!, {
      passKind:    passKind as 'stamps' | 'points',
      totalPoints: customer.total_points ?? 0,
      stampsCount: customer.stamps_count ?? 0,
      stampsTotal: settings?.stamps_total ?? 10,
    });

    await supabaseAdmin
      .from('wallet_passes')
      .update({
        last_synced_at: result.ok ? new Date().toISOString() : undefined,
        sync_error:     result.ok ? null : (result.error ?? 'Cron retry failed'),
      })
      .eq('id', pass.id);

    if (result.ok) succeeded++;
    else           failed++;
  }));

  console.log(`[cron/wallet-sync] retried=${failedPasses.length} succeeded=${succeeded} failed=${failed}`);
  return Response.json({ retried: failedPasses.length, succeeded, failed });
}
