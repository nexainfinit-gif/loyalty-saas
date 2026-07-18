// app/api/cron/wallet-sync/route.ts
//
// Two-phase wallet sync cron:
//   Phase 1: Drain wallet_sync_queue (pending items from recent scans)
//   Phase 2: Retry failed syncs on wallet_passes (existing behavior)
//
// Runs every 6 hours via Vercel Cron. Secured with CRON_SECRET.

import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateLoyaltyObject } from '@/lib/google-wallet';
import { recoverGooglePassById } from '@/lib/wallet-recovery';
import { pushPassUpdate } from '@/lib/apns';
import { logger } from '@/lib/logger';

const MAX_QUEUE_DRAIN = 50;
const MAX_RETRY       = 50;
const MAX_ATTEMPTS    = 5;

/**
 * Lien « Mon espace client » tokenisé pour un client — patché à chaque synchro
 * Google : les passes émis AVANT l'ajout du lien (2026-07-17) se mettent à
 * niveau d'eux-mêmes, sans script de migration.
 */
async function portalUrlFor(restaurantId: string, customerId: string): Promise<string | undefined> {
  const [{ data: resto }, { data: cust }] = await Promise.all([
    supabaseAdmin.from('restaurants').select('slug').eq('id', restaurantId).maybeSingle(),
    supabaseAdmin.from('customers').select('qr_token').eq('id', customerId).maybeSingle(),
  ]);
  if (!resto?.slug || !cust?.qr_token) return undefined;
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/fr/client/${resto.slug}?t=${cust.qr_token}`;
}

export async function GET(req: Request) {
  // Verify Vercel Cron secret
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const authorized = auth.length === expected.length &&
    timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = { queue_processed: 0, queue_synced: 0, queue_skipped: 0, retried: 0, succeeded: 0, failed: 0, recovered: 0, apns_sent: 0, apns_failed: 0 };

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
        .select('id, object_id, pass_kind, total_points, stamps_count')
        .eq('customer_id', item.customer_id)
        .eq('platform', 'google')
        .eq('status', 'active')
        .not('object_id', 'is', null);

      // Find active Apple passes for this customer (for APNS push)
      const { data: applePasses } = await supabaseAdmin
        .from('wallet_passes')
        .select('id, push_token')
        .eq('customer_id', item.customer_id)
        .eq('platform', 'apple')
        .eq('status', 'active')
        .not('push_token', 'is', null);

      if (!googlePasses?.length && !applePasses?.length) {
        // No passes to sync — mark done
        await supabaseAdmin
          .from('wallet_sync_queue')
          .update({ status: 'done', processed_at: new Date().toISOString() })
          .eq('id', item.id);
        stats.queue_skipped++;
        return;
      }

      const { data: settings } = await supabaseAdmin
        .from('loyalty_settings')
        .select('stamps_total, program_type')
        .eq('restaurant_id', item.restaurant_id)
        .maybeSingle();

      let allOk = true;

      // Sync Google passes — use pass-level counters (already fetched in select)
      if (googlePasses?.length) {
        const portalUrl = await portalUrlFor(item.restaurant_id, item.customer_id);
        await Promise.allSettled(googlePasses.map(async (pass) => {
          const effectivePassKind = (
            pass.pass_kind === 'stamps' || pass.pass_kind === 'points'
              ? pass.pass_kind
              : settings?.program_type === 'stamps' ? 'stamps' : 'points'
          ) as 'stamps' | 'points';

          const result = await updateLoyaltyObject(pass.object_id!, {
            passKind:    effectivePassKind,
            totalPoints: pass.total_points ?? 0,
            stampsCount: pass.stamps_count ?? 0,
            stampsTotal: settings?.stamps_total ?? 10,
            portalUrl,
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
      }

      // Send APNS push notifications to Apple passes (fire-and-forget per pass)
      if (applePasses?.length) {
        await Promise.allSettled(applePasses.map(async (pass) => {
          try {
            await pushPassUpdate(pass.push_token!);
            stats.apns_sent++;
          } catch (err) {
            stats.apns_failed++;
            logger.error({ ctx: 'cron/wallet-sync', msg: 'APNS push failed', passId: pass.id, err: err instanceof Error ? err.message : String(err) });
          }
        }));
      }

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
    .select('id, object_id, restaurant_id, customer_id, pass_kind, total_points, stamps_count')
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

      const { data: settings } = await supabaseAdmin
        .from('loyalty_settings')
        .select('stamps_total, program_type')
        .eq('restaurant_id', pass.restaurant_id)
        .maybeSingle();

      // Use pass-level pass_kind and counters
      const effectivePassKind = (
        pass.pass_kind === 'stamps' || pass.pass_kind === 'points'
          ? pass.pass_kind
          : settings?.program_type === 'stamps' ? 'stamps' : 'points'
      ) as 'stamps' | 'points';

      let result = await updateLoyaltyObject(pass.object_id!, {
        passKind:    effectivePassKind,
        totalPoints: pass.total_points ?? 0,
        stampsCount: pass.stamps_count ?? 0,
        stampsTotal: settings?.stamps_total ?? 10,
        portalUrl:   await portalUrlFor(pass.restaurant_id, pass.customer_id),
      });

      // Objet jamais créé chez Google (échec à l'émission) : le PATCH renvoie
      // 404 pour toujours — on escalade vers la récupération complète
      // (classe + recréation de l'objet), puis on réapplique les compteurs
      // du pass (la recréation part des compteurs client).
      if (!result.ok && result.status === 404) {
        const rec = await recoverGooglePassById(pass.id);
        if (rec.ok) {
          stats.recovered++;
          result = await updateLoyaltyObject(pass.object_id!, {
            passKind:    effectivePassKind,
            totalPoints: pass.total_points ?? 0,
            stampsCount: pass.stamps_count ?? 0,
            stampsTotal: settings?.stamps_total ?? 10,
          });
        } else {
          logger.error({ ctx: 'cron/wallet-sync', msg: 'recovery failed', passId: pass.id, err: rec.error ?? 'unknown' });
        }
      }

      await supabaseAdmin
        .from('wallet_passes')
        .update({
          last_synced_at: result.ok ? new Date().toISOString() : undefined,
          sync_error:     result.ok ? null : (result.error ?? 'Cron retry failed'),
        })
        .eq('id', pass.id);

      if (result.ok) {
        stats.succeeded++;

        // Also send APNS push to any active Apple passes for this customer
        const { data: applePassesRetry } = await supabaseAdmin
          .from('wallet_passes')
          .select('id, push_token')
          .eq('customer_id', pass.customer_id)
          .eq('platform', 'apple')
          .eq('status', 'active')
          .not('push_token', 'is', null);

        if (applePassesRetry?.length) {
          await Promise.allSettled(applePassesRetry.map(async (ap) => {
            try {
              await pushPassUpdate(ap.push_token!);
              stats.apns_sent++;
            } catch (err) {
              stats.apns_failed++;
              logger.error({ ctx: 'cron/wallet-sync', msg: 'APNS push failed (retry phase)', passId: ap.id, err: err instanceof Error ? err.message : String(err) });
            }
          }));
        }
      } else {
        stats.failed++;
      }
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
