import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateLoyaltyObject, ensureLoyaltyClass, createLoyaltyObject } from '@/lib/google-wallet';
import { logger } from '@/lib/logger';

/**
 * Auto-réparation : recrée la classe et l'objet Google manquants (PATCH → 404).
 * Cas réel constaté (KIKO, 2026-07-22) : la création avait échoué à l'émission
 * de façon transitoire et RIEN ne réparait jamais — le cron nocturne re-PATCHait
 * un objet inexistant pour l'éternité (« Cron retry failed »).
 */
async function repairMissingObject(
  pass: { id: string; object_id: string | null; pass_kind: string | null; total_points: number | null; stamps_count: number | null; short_code?: string | null },
  customerId: string,
  restaurantId: string,
  settings: { stamps_total?: number | null; program_type?: string | null; reward_threshold?: number | null; reward_message?: string | null } | null,
): Promise<boolean> {
  const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID;
  if (!ISSUER_ID || !pass.object_id) return false;

  const [{ data: customer }, { data: restaurant }, { data: template }] = await Promise.all([
    supabaseAdmin.from('customers').select('first_name, last_name, qr_token').eq('id', customerId).maybeSingle(),
    supabaseAdmin.from('restaurants').select('name, slug, primary_color, logo_url').eq('id', restaurantId).maybeSingle(),
    supabaseAdmin.from('wallet_pass_templates').select('primary_color')
      .eq('restaurant_id', restaurantId).eq('status', 'published').eq('is_default', true).maybeSingle(),
  ]);
  if (!customer || !restaurant) return false;

  const passKind = (pass.pass_kind === 'stamps' || pass.pass_kind === 'points'
    ? pass.pass_kind
    : settings?.program_type === 'stamps' ? 'stamps' : 'points') as 'stamps' | 'points';
  const classId = `${ISSUER_ID}.r${restaurantId.replace(/-/g, '')}_${passKind}`;

  const cls = await ensureLoyaltyClass({
    classId,
    restaurantName: restaurant.name,
    primaryColor: template?.primary_color ?? restaurant.primary_color ?? '#4f6bed',
    passKind,
    logoUrl: restaurant.logo_url,
  });
  if (!cls.ok) return false;

  const created = await createLoyaltyObject({
    objectId: pass.object_id,
    classId,
    customerId,
    displayName: `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
    totalPoints: pass.total_points ?? 0,
    stampsCount: pass.stamps_count ?? 0,
    stampsTotal: Number(settings?.stamps_total ?? 10),
    rewardThreshold: Number(settings?.reward_threshold ?? 100),
    rewardMessage: String(settings?.reward_message ?? 'Récompense offerte !'),
    qrToken: customer.qr_token ?? customerId,
    shortCode: pass.short_code ?? undefined,
    restaurantName: restaurant.name,
    primaryColor: template?.primary_color ?? restaurant.primary_color ?? '#4f6bed',
    passKind,
    portalUrl: restaurant.slug
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/fr/client/${restaurant.slug}?t=${customer.qr_token ?? ''}`
      : null,
  });
  if (created.ok) {
    logger.info({ ctx: 'wallet-sync-now', rid: restaurantId, msg: `Google object repaired (recreated) for pass ${pass.id}` });
  }
  return created.ok;
}

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
      .select('id, object_id, pass_kind, total_points, stamps_count, short_code')
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
      .select('stamps_total, program_type, reward_threshold, reward_message')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    let allOk = true;
    await Promise.allSettled(googlePasses.map(async (pass) => {
      const effectivePassKind = (
        pass.pass_kind === 'stamps' || pass.pass_kind === 'points'
          ? pass.pass_kind
          : settings?.program_type === 'stamps' ? 'stamps' : 'points'
      ) as 'stamps' | 'points';

      let result = await updateLoyaltyObject(pass.object_id as string, {
        passKind:    effectivePassKind,
        totalPoints: pass.total_points ?? 0,
        stampsCount: pass.stamps_count ?? 0,
        stampsTotal: settings?.stamps_total ?? 10,
      });

      // Objet inexistant chez Google (création ratée à l'émission) →
      // auto-réparation : recrée classe + objet avec le solde courant.
      if (!result.ok && result.status === 404) {
        const repaired = await repairMissingObject(pass, customerId, restaurantId, settings);
        if (repaired) result = { ok: true, status: 200, data: null };
      }

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
