import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureLoyaltyClass,
  recoverLoyaltyObject,
  type GooglePassData,
} from '@/lib/google-wallet';

/**
 * Récupération d'UN pass Google cassé — objet jamais créé chez Google
 * (échec à l'émission) ou désactivé. Même stratégie que le endpoint
 * POST /api/wallet/passes/recover (version batch, déclenchée par le bouton
 * « Récupérer » du Studio Wallet), mais appelable par le cron wallet-sync :
 * sans elle, le PATCH aveugle du cron bouclait en 404 pour toujours.
 */
export async function recoverGooglePassById(
  passId: string,
): Promise<{ ok: boolean; strategy?: string; error?: string }> {
  const { data: pass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, object_id, template_id, customer_id, restaurant_id, pass_version, short_code')
    .eq('id', passId)
    .eq('platform', 'google')
    .maybeSingle();

  if (!pass?.object_id) return { ok: false, error: 'pass ou object_id introuvable' };

  const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID;
  if (!ISSUER_ID) return { ok: false, error: 'GOOGLE_WALLET_ISSUER_ID manquant' };

  const [{ data: restaurant }, { data: template }, { data: customer }, { data: settings }] =
    await Promise.all([
      supabaseAdmin
        .from('restaurants')
        .select('id, name, slug, primary_color, logo_url')
        .eq('id', pass.restaurant_id)
        .maybeSingle(),
      supabaseAdmin
        .from('wallet_pass_templates')
        .select('pass_kind, config_json, primary_color')
        .eq('id', pass.template_id)
        .maybeSingle(),
      supabaseAdmin
        .from('customers')
        .select('id, first_name, last_name, qr_token, stamps_count, total_points')
        .eq('id', pass.customer_id)
        .maybeSingle(),
      supabaseAdmin
        .from('loyalty_settings')
        .select('stamps_total, reward_threshold, reward_message')
        .eq('restaurant_id', pass.restaurant_id)
        .maybeSingle(),
    ]);

  if (!restaurant || !template || !customer) {
    return { ok: false, error: 'restaurant, template ou client introuvable' };
  }

  const passKind     = template.pass_kind as 'stamps' | 'points' | 'event';
  const classId      = `${ISSUER_ID}.r${pass.restaurant_id.replace(/-/g, '')}_${passKind}`;
  const primaryColor = template.primary_color ?? restaurant.primary_color ?? '#4f6bed';

  // Merge template config avec les réglages fidélité (même pattern qu'à l'émission)
  const resolvedConfig: Record<string, unknown> = {
    ...((template.config_json as Record<string, unknown>) ?? {}),
    ...(settings ? {
      stamps_total:     settings.stamps_total,
      reward_threshold: settings.reward_threshold,
      reward_message:   settings.reward_message,
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
    // Le QR du pass doit encoder le short_code stocké (lookup scan) quand il existe.
    ...(pass.short_code ? { shortCode: pass.short_code } : {}),
    restaurantName:  restaurant.name,
    primaryColor,
    passKind,
    portalUrl: customer.qr_token
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/fr/client/${restaurant.slug}?t=${customer.qr_token}`
      : null,
  };

  // 1. La classe DOIT exister avant toute création d'objet
  const classResult = await ensureLoyaltyClass({
    classId,
    restaurantName: restaurant.name,
    primaryColor,
    passKind,
    logoUrl: restaurant.logo_url,
  });
  if (!classResult.ok) return { ok: false, error: 'class creation failed' };

  // 2. GET → déjà actif / réactivé / recréé de zéro
  const recovery = await recoverLoyaltyObject(passData);
  if (!recovery.ok) return { ok: false, error: recovery.error };

  // 3. Succès confirmé seulement : clear sync_error + bump pass_version
  await supabaseAdmin
    .from('wallet_passes')
    .update({
      sync_error:     null,
      last_synced_at: new Date().toISOString(),
      pass_version:   (pass.pass_version ?? 1) + 1,
    })
    .eq('id', pass.id);

  return { ok: true, strategy: recovery.strategy };
}
