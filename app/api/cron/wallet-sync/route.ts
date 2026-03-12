// app/api/cron/wallet-sync/route.ts
//
// Two-phase wallet sync cron:
//   Phase 1: Drain wallet_sync_queue (pending items from recent scans)
//   Phase 2: Retry failed syncs on wallet_passes (existing behavior)
//
// Runs every 6 hours via Vercel Cron. Secured with CRON_SECRET.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateLoyaltyObject } from '@/lib/google-wallet';
import { logger } from '@/lib/logger';

const MAX_QUEUE_DRAIN = 50;
const MAX_RETRY       = 50;
const MAX_ATTEMPTS    = 5;

export async function GET(req: Request) {
  // Verify Vercel Cron secret
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = { queue_processed: 0, queue_synced: 0, queue_skipped: 0, retried: 0, succeeded: 0, failed: 0 };

  // ── Phase 1: Drain wallet_sync_queue ──────────────────────────────────
  const { data: queueItems } = await supabaseAdmin
    .from('wallet_sync_queue')
    .select('id, customer_id, restaurant_id, scan_event_id, attempts')
    .in('status', ['pending', 'failed'])
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(MAX_QUEUE_DRAIN);

  if (queueItems?.length) {
    await Promise.allSettled(queueItems.map(async (item) => {
      stats.queue_processed++;

      // Mark as processing
      await supabaseAdmin
        .from('wallet_sync_queue')
        .update({ status: 'processing', attempts: item.attempts + 1 })
        .eq('id', item.id);

      // Find active Google passes for this customer
      const { data: googlePasses } = await supabaseAdmin
        .from('wallet_passes')
        .select('id, object_id, wallet_pass_templates(pass_kind)')
        .eq('customer_id', item.customer_id)
        .eq('platform', 'google')
        .eq('status', 'active')
        .not('object_id', 'is', null);

      if (!googlePasses?.length) {
        // No Google passes to sync — mark done
        await supabaseAdmin
          .from('wallet_sync_queue')
          .update({ status: 'done', processed_at: new Date().toISOString() })
          .eq('id', item.id);
        stats.queue_skipped++;
        return;
      }

      // Fetch live customer data
      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('total_points, stamps_count')
        .eq('id', item.customer_id)
        .maybeSingle();

      if (!customer) {
        await supabaseAdmin
          .from('wallet_sync_queue')
          .update({ status: 'failed', last_error: 'Customer not found', processed_at: new Date().toISOString() })
          .eq('id', item.id);
        return;
      }

      const { data: settings } = await supabaseAdmin
        .from('loyalty_settings')
        .select('stamps_total')
        .eq('restaurant_id', item.restaurant_id)
        .maybeSingle();

      let allOk = true;
      await Promise.allSettled(googlePasses.map(async (pass) => {
        const passKind = (pass.wallet_pass_templates as unknown as { pass_kind: string } | null)?.pass_kind ?? 'points';

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
            sync_error:     result.ok ? null : (result.error ?? 'Queue sync failed'),
          })
          .eq('id', pass.id);

        if (!result.ok) allOk = false;
      }));

      await supabaseAdmin
        .from('wallet_sync_queue')
        .update({
          status:       allOk ? 'done' : 'failed',
          last_error:   allOk ? null : 'One or more passes failed to sync',
          processed_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (allOk) stats.queue_synced++;
    }));
  }

  // ── Phase 2: Retry failed syncs (existing behavior) ───────────────────
  const { data: failedPasses, error: fetchErr } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, object_id, restaurant_id, customer_id, wallet_pass_templates(pass_kind)')
    .eq('platform', 'google')
    .eq('status', 'active')
    .not('object_id', 'is', null)
    .not('sync_error', 'is', null)
    .limit(MAX_RETRY);

  if (fetchErr) {
    logger.error({ ctx: 'cron/wallet-sync', msg: 'fetch failed', err: fetchErr.message });
    return Response.json({ error: fetchErr.message, ...stats }, { status: 500 });
  }

  if (failedPasses?.length) {
    await Promise.allSettled(failedPasses.map(async (pass) => {
      stats.retried++;

      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('total_points, stamps_count')
        .eq('id', pass.customer_id)
        .maybeSingle();

      if (!customer) { stats.failed++; return; }

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

      if (result.ok) stats.succeeded++;
      else           stats.failed++;
    }));
  }

  // ── Cleanup: remove old completed queue entries ───────────────────────
  await supabaseAdmin
    .from('wallet_sync_queue')
    .delete()
    .eq('status', 'done')
    .lt('processed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  logger.info({ ctx: 'cron/wallet-sync', msg: 'completed', ...stats });
  return Response.json(stats);
}
