import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateLoyaltyObject } from '@/lib/google-wallet';
import { logger } from '@/lib/logger';

/**
 * Synchronisation IMMÉDIATE des passes Google d'un client après un scan —
 * parité avec Apple (push APNS instantané). Avant : le solde Google n'était
 * rafraîchi que par le cron nocturne (1h UTC) → un client Android rouvrant sa
 * carte juste après un scan voyait l'ancien solde jusqu'au lendemain.
 *
 * Utilise les compteurs PAR PASS (031, mis à jour par le trigger de
 * transactions) — même logique que le cron wallet-sync, qui reste le filet de
 * rattrapage. Best-effort : ne bloque jamais la réponse du scan ; en cas
 * d'échec, sync_error est posé et le cron nocturne reprendra la main.
 *
 * @param queueItemId — ligne wallet_sync_queue fraîchement insérée : marquée
 * « done » si tous les passes sont synchronisés (évite le double travail du cron).
 */
export async function syncGooglePassesNow(
  customerId: string,
  restaurantId: string,
  queueItemId?: string | null,
): Promise<void> {
  try {
    const { data: googlePasses } = await supabaseAdmin
      .from('wallet_passes')
      .select('id, object_id, pass_kind, total_points, stamps_count')
      .eq('customer_id', customerId)
      .eq('restaurant_id', restaurantId)
      .eq('platform', 'google')
      .eq('status', 'active')
      .not('object_id', 'is', null);

    if (!googlePasses?.length) {
      // Rien à synchroniser → la ligne de file est déjà « soldée ».
      if (queueItemId) {
        await supabaseAdmin
          .from('wallet_sync_queue')
          .update({ status: 'done', processed_at: new Date().toISOString() })
          .eq('id', queueItemId);
      }
      return;
    }

    const { data: settings } = await supabaseAdmin
      .from('loyalty_settings')
      .select('stamps_total, program_type')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    let allOk = true;
    await Promise.allSettled(googlePasses.map(async (pass) => {
      const effectivePassKind = (
        pass.pass_kind === 'stamps' || pass.pass_kind === 'points'
          ? pass.pass_kind
          : settings?.program_type === 'stamps' ? 'stamps' : 'points'
      ) as 'stamps' | 'points';

      const result = await updateLoyaltyObject(pass.object_id as string, {
        passKind:    effectivePassKind,
        totalPoints: pass.total_points ?? 0,
        stampsCount: pass.stamps_count ?? 0,
        stampsTotal: settings?.stamps_total ?? 10,
      });

      await supabaseAdmin
        .from('wallet_passes')
        .update({
          last_synced_at: result.ok ? new Date().toISOString() : undefined,
          sync_error:     result.ok ? null : (result.error ?? 'Immediate sync failed'),
        })
        .eq('id', pass.id);

      if (!result.ok) allOk = false;
    }));

    if (allOk && queueItemId) {
      await supabaseAdmin
        .from('wallet_sync_queue')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('id', queueItemId);
    }
  } catch (err) {
    // Le cron nocturne rattrapera — on ne casse jamais la réponse du scan.
    logger.error({ ctx: 'wallet-sync-now', rid: restaurantId, msg: 'immediate Google sync failed', err: err instanceof Error ? err.message : String(err) });
  }
}
