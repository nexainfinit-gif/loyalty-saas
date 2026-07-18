// app/api/Restaurant/delete/route.ts
//
// Suppression DÉFINITIVE d'un établissement — zone de danger des Réglages.
// Réservée au PROPRIÉTAIRE (owner_id), pas aux admins d'équipe.
//
// Flux en DEUX étapes (comme un OTP de connexion) :
//   Étape A (sans `code` dans le body) : vérifie propriété + nom exact, génère
//     un code à 6 chiffres, le stocke HACHÉ (sha256, expiration 10 min) dans le
//     KV restaurant_settings, et l'envoie à l'email du COMPTE PROPRIÉTAIRE.
//     → même un dashboard laissé ouvert ne suffit pas à supprimer.
//   Étape B (avec `code`) : vérifie le code puis exécute la suppression :
//   1. annulation de l'abonnement Stripe (on ne supprime JAMAIS un
//      établissement qui continuerait à être facturé) — l'add-on Booking
//      est une ligne du même abonnement, il meurt avec
//   2. expiration best-effort des passes Google Wallet (les cartes meurent
//      proprement dans les téléphones ; les passes Apple cessent simplement
//      de se mettre à jour)
//   3. purge des 7 tables SANS ON DELETE CASCADE vers restaurants
//   4. suppression du restaurant → la cascade emporte tout le reste
//      (clients, transactions, passes, RDV, campagnes, billetterie…)

import { NextResponse } from 'next/server';
import { createHash, randomInt } from 'crypto';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateLoyaltyObject } from '@/lib/google-wallet';
import { stripe } from '@/lib/stripe';
import { mailer } from '@/lib/mailer';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const CODE_TTL_MS = 10 * 60 * 1000;
const KV_CODE = 'delete_code_hash';
const KV_EXP  = 'delete_code_expires';
const codeLimiter = rateLimit({ prefix: 'restaurant-delete-code', limit: 3, windowMs: 600_000 });

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tables référençant restaurants SANS cascade (audit migrations 015/017/018/020/053).
// ⚠️ Ordre important : wallet_sync_queue référence scan_events (018, sans
// cascade) → la file doit partir AVANT les événements de scan.
const NON_CASCADE_TABLES = [
  'audit_log',
  'team_invites',
  'team_members',
  'wallet_sync_queue',
  'scan_events',
  'referrals',
  'affiliate_commissions',
];

export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : null;
  const confirmName  = typeof body?.confirmName === 'string' ? body.confirmName.trim() : '';
  const code         = typeof body?.code === 'string' ? body.code.trim() : '';
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

  // ── Étape A : pas de code fourni → génération + envoi par email ────────
  if (!code) {
    if (!codeLimiter.check(getClientIp(request)).success) {
      return NextResponse.json({ error: 'Trop de demandes de code. Réessayez dans quelques minutes.' }, { status: 429 });
    }

    // Email du COMPTE propriétaire (pas celui de l'établissement) — c'est lui
    // qui détient le droit de suppression.
    const { data: ownerUser } = await supabaseAdmin.auth.admin.getUserById(guard.userId);
    const ownerEmail = ownerUser?.user?.email;
    if (!ownerEmail) {
      return NextResponse.json({ error: 'Email du propriétaire introuvable.' }, { status: 500 });
    }

    const newCode = String(randomInt(100000, 1000000));
    const expires = String(Date.now() + CODE_TTL_MS);
    const { error: kvErr } = await supabaseAdmin
      .from('restaurant_settings')
      .upsert(
        [
          { restaurant_id: restaurantId, key: KV_CODE, value: hashCode(newCode) },
          { restaurant_id: restaurantId, key: KV_EXP,  value: expires },
        ],
        { onConflict: 'restaurant_id,key' },
      );
    if (kvErr) {
      logger.error({ ctx: 'restaurant/delete', rid: restaurantId, msg: 'code KV upsert failed', err: kvErr.message });
      return NextResponse.json({ error: 'Erreur serveur. Réessayez.' }, { status: 500 });
    }

    try {
      await mailer.emails.send({
        from: 'Rebites <noreply@rebites.be>',
        to: ownerEmail,
        subject: `Code de confirmation — suppression de ${restaurant.name}`,
        html: `
          <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
            <h2 style="color: #b91c1c; margin: 0 0 1rem;">Suppression d'établissement</h2>
            <p style="color: #374151;">Vous avez demandé la suppression définitive de <strong>${esc(restaurant.name)}</strong>.</p>
            <p style="color: #374151;">Code de confirmation (valable 10 minutes) :</p>
            <p style="text-align: center; margin: 1.5rem 0;">
              <span style="display: inline-block; font-size: 2rem; font-weight: 700; letter-spacing: 0.35em; padding: 0.75rem 1.5rem; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">${newCode}</span>
            </p>
            <p style="color: #6b7280; font-size: 0.85rem;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email et changez votre mot de passe : quelqu'un a accès à votre tableau de bord.</p>
          </div>
        `,
      });
    } catch (err) {
      logger.error({ ctx: 'restaurant/delete', rid: restaurantId, msg: 'code email failed', err: err instanceof Error ? err.message : String(err) });
      return NextResponse.json({ error: 'Impossible d\'envoyer l\'email de confirmation. Réessayez.' }, { status: 502 });
    }

    // Email masqué pour l'UI (me****@gmail.com)
    const [local, domain] = ownerEmail.split('@');
    const masked = `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
    logger.info({ ctx: 'restaurant/delete', rid: restaurantId, msg: `deletion code sent to owner ${guard.userId}` });
    return NextResponse.json({ codeSent: true, email: masked });
  }

  // ── Étape B : vérification du code ─────────────────────────────────────
  const { data: kvRows } = await supabaseAdmin
    .from('restaurant_settings')
    .select('key, value')
    .eq('restaurant_id', restaurantId)
    .in('key', [KV_CODE, KV_EXP]);
  const kv = Object.fromEntries((kvRows ?? []).map((r) => [r.key, r.value as string]));

  const expired = !kv[KV_EXP] || Date.now() > Number(kv[KV_EXP]);
  if (!kv[KV_CODE] || expired || hashCode(code) !== kv[KV_CODE]) {
    return NextResponse.json({ error: 'Code invalide ou expiré. Redemandez un code.' }, { status: 400 });
  }

  // Code à usage unique : consommé immédiatement (avant la suppression, pour
  // qu'un échec Stripe ne laisse pas un code encore valide traîner).
  await supabaseAdmin
    .from('restaurant_settings')
    .delete()
    .eq('restaurant_id', restaurantId)
    .in('key', [KV_CODE, KV_EXP]);

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
