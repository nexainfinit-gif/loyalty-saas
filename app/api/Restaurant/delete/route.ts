// app/api/Restaurant/delete/route.ts
//
// Suppression DÉFINITIVE d'un établissement — zone de danger des Réglages.
// Réservée au PROPRIÉTAIRE (owner_id), pas aux admins d'équipe.
//
// Ordre des opérations (chaque étape protège la suivante) :
//   1. vérifs : propriété + confirmation du nom exacte
//   2. annulation de l'abonnement Stripe (on ne supprime JAMAIS un
//      établissement qui continuerait à être facturé) — l'add-on Booking
//      est une ligne du même abonnement, il meurt avec
//   3. expiration best-effort des passes Google Wallet (les cartes meurent
//      proprement dans les téléphones ; les passes Apple cessent simplement
//      de se mettre à jour)
//   4. purge des 7 tables SANS ON DELETE CASCADE vers restaurants
//   5. suppression du restaurant → la cascade emporte tout le reste
//      (clients, transactions, passes, RDV, campagnes, billetterie…)

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateLoyaltyObject } from '@/lib/google-wallet';
import { stripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tables référençant restaurants SANS cascade (audit migrations 015/017/018/020/053)
const NON_CASCADE_TABLES = [
  'audit_log',
  'team_invites',
  'team_members',
  'scan_events',
  'wallet_sync_queue',
  'referrals',
  'affiliate_commissions',
];

export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : null;
  const confirmName  = typeof body?.confirmName === 'string' ? body.confirmName.trim() : '';
  if (!restaurantId || !confirmName) {
    return NextResponse.json({ error: 'restaurantId et confirmName requis.' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, owner_id, stripe_subscription_id')
    .eq('id', restaurantId)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }
  // Strictement le propriétaire — un restaurant_admin d'équipe ne peut pas
  // supprimer l'établissement de quelqu'un d'autre.
  if (restaurant.owner_id !== guard.userId) {
    return NextResponse.json({ error: 'Seul le propriétaire peut supprimer cet établissement.' }, { status: 403 });
  }
  // Confirmation serveur : le nom doit être retapé à l'identique.
  if (confirmName !== restaurant.name) {
    return NextResponse.json({ error: 'Le nom saisi ne correspond pas au nom de l\'établissement.' }, { status: 400 });
  }

  // ── 2. Stripe : annule l'abonnement (échec bloquant sauf déjà annulé) ──
  if (restaurant.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(restaurant.stripe_subscription_id);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const msg  = err instanceof Error ? err.message : 'Erreur Stripe';
      if (code !== 'resource_missing') {
        logger.error({ ctx: 'restaurant/delete', rid: restaurantId, msg: 'Stripe cancel failed', err: msg });
        return NextResponse.json(
          { error: 'Impossible d\'annuler l\'abonnement Stripe — suppression interrompue. Réessayez ou contactez le support.' },
          { status: 502 },
        );
      }
    }
  }

  // ── 3. Passes Google : expiration best-effort (cap 100) ────────────────
  try {
    const { data: gPasses } = await supabaseAdmin
      .from('wallet_passes')
      .select('object_id')
      .eq('restaurant_id', restaurantId)
      .eq('platform', 'google')
      .eq('status', 'active')
      .not('object_id', 'is', null)
      .limit(100);
    await Promise.allSettled(
      (gPasses ?? []).map((p) => updateLoyaltyObject(p.object_id as string, { state: 'EXPIRED' })),
    );
  } catch { /* best-effort — ne bloque jamais la suppression */ }

  // ── 4. Purge des tables sans cascade ───────────────────────────────────
  for (const table of NON_CASCADE_TABLES) {
    const { error } = await supabaseAdmin.from(table).delete().eq('restaurant_id', restaurantId);
    if (error) {
      logger.error({ ctx: 'restaurant/delete', rid: restaurantId, msg: `purge ${table} failed`, err: error.message });
      return NextResponse.json(
        { error: `Suppression interrompue (données liées : ${table}). Réessayez ou contactez le support.` },
        { status: 500 },
      );
    }
  }

  // ── 5. Le restaurant lui-même → cascade sur tout le reste ──────────────
  const { error: delErr } = await supabaseAdmin.from('restaurants').delete().eq('id', restaurantId);
  if (delErr) {
    logger.error({ ctx: 'restaurant/delete', rid: restaurantId, msg: 'final delete failed', err: delErr.message });
    return NextResponse.json(
      { error: 'Suppression interrompue. Réessayez ou contactez le support.' },
      { status: 500 },
    );
  }

  logger.info({ ctx: 'restaurant/delete', rid: restaurantId, msg: `deleted by owner ${guard.userId} (${restaurant.name})` });
  return NextResponse.json({ success: true });
}
