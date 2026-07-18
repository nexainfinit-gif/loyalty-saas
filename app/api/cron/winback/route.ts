// app/api/cron/winback/route.ts
//
// Relance automatique des clients inactifs (win-back) — automation marketing.
// Quotidien via Vercel Cron. Pour chaque établissement ayant activé le
// toggle 😴 « Client inactif » (loyalty_settings.notify_inactive — présent
// dans l'UI depuis mars mais jamais consommé jusqu'ici) : clients avec
// consentement marketing, sans visite depuis winback_days jours (057),
// jamais relancés pendant la période de cooldown → email « vos points vous
// attendent » avec solde + accès direct espace client.
//
// Garde-fous :
//  - dédup via automation_sends (cooldown = max(90 j, 2 × winback_days))
//  - cap 30 envois / établissement / jour (protège le quota Brevo quotidien)
//  - quota emails/mois du plan respecté (comptabilisé via une ligne campaigns
//    type 'winback_auto' → visible dans l'historique campagnes du dashboard)

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWinbackEmail } from '@/lib/email';
import { checkEmailQuota } from '@/lib/plan-limits';
import { logger } from '@/lib/logger';

const MAX_PER_RESTAURANT_PER_RUN = 30;

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  if (!timingSafeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Établissements ayant activé la relance (toggle notify_inactive existant ;
  // winback_days vient de la 057 — best-effort : si la migration n'est pas
  // encore exécutée, le select échoue → no-op).
  const { data: enabled, error: settingsErr } = await supabaseAdmin
    .from('loyalty_settings')
    .select('restaurant_id, winback_days, program_type, reward_threshold, stamps_total')
    .eq('notify_inactive', true);

  if (settingsErr) {
    logger.warn({ ctx: 'cron/winback', msg: 'settings query failed (migration 057 exécutée ?)', err: settingsErr.message });
    return NextResponse.json({ success: true, skipped: 'no settings' });
  }
  if (!enabled?.length) {
    return NextResponse.json({ success: true, restaurants: 0, sent: 0 });
  }

  const stats = { restaurants: 0, sent: 0, failed: 0, quota_blocked: 0 };

  for (const settings of enabled) {
    const restaurantId = settings.restaurant_id as string;
    const winbackDays  = Math.max(7, Number(settings.winback_days ?? 45));
    const cooldownDays = Math.max(90, winbackDays * 2);
    const cutoff       = new Date(Date.now() - winbackDays * 86400000).toISOString();
    const cooldownFrom = new Date(Date.now() - cooldownDays * 86400000).toISOString();

    const { data: restaurant } = await supabaseAdmin
      .from('restaurants')
      .select('id, name, slug, primary_color, plan, is_demo')
      .eq('id', restaurantId)
      .maybeSingle();
    if (!restaurant || restaurant.is_demo) continue;

    // Clients inactifs consentants (dernière visite — ou inscription si
    // jamais venu — antérieure au seuil).
    const { data: candidates } = await supabaseAdmin
      .from('customers')
      .select('id, first_name, email, qr_token, total_points, stamps_count, last_visit_at, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('consent_marketing', true)
      .not('email', 'is', null)
      .or(`last_visit_at.lt.${cutoff},and(last_visit_at.is.null,created_at.lt.${cutoff})`);

    if (!candidates?.length) continue;

    // Dédup : déjà relancés pendant le cooldown
    const { data: recentSends } = await supabaseAdmin
      .from('automation_sends')
      .select('customer_id')
      .eq('restaurant_id', restaurantId)
      .eq('type', 'winback')
      .gte('sent_at', cooldownFrom);
    const alreadySent = new Set((recentSends ?? []).map((s) => s.customer_id));

    const batch = candidates
      .filter((c) => !alreadySent.has(c.id))
      .slice(0, MAX_PER_RESTAURANT_PER_RUN);
    if (!batch.length) continue;

    // Quota emails/mois du plan
    const quota = await checkEmailQuota(restaurantId, restaurant.plan, batch.length);
    if (!quota.allowed) {
      stats.quota_blocked++;
      logger.warn({ ctx: 'cron/winback', rid: restaurantId, msg: `email quota reached (${quota.current}/${quota.limit}) — skipped` });
      continue;
    }

    stats.restaurants++;
    const programType = (settings.program_type === 'stamps' ? 'stamps' : 'points') as 'points' | 'stamps';
    let sentForRestaurant = 0;

    for (const c of batch) {
      try {
        await sendWinbackEmail({
          to: c.email as string,
          firstName: c.first_name ?? '',
          restaurantName: restaurant.name,
          restaurantColor: restaurant.primary_color ?? '#4F6BED',
          restaurantSlug: restaurant.slug,
          qrToken: c.qr_token ?? null,
          programType,
          balance: programType === 'stamps' ? (c.stamps_count ?? 0) : (c.total_points ?? 0),
          target: programType === 'stamps'
            ? Number(settings.stamps_total ?? 10)
            : Number(settings.reward_threshold ?? 100),
        });
        await supabaseAdmin.from('automation_sends').insert({
          restaurant_id: restaurantId,
          customer_id: c.id,
          type: 'winback',
        });
        sentForRestaurant++;
        stats.sent++;
      } catch (err) {
        stats.failed++;
        logger.error({ ctx: 'cron/winback', rid: restaurantId, msg: 'send failed', err: err instanceof Error ? err.message : String(err) });
      }
    }

    // Comptabilité quota + historique : une ligne campagne par run réussi.
    // NB : segment_type a une contrainte CHECK — 'inactive_45' est la valeur
    // du segment manuel existant (les valeurs custom sont rejetées).
    if (sentForRestaurant > 0) {
      const { error: campErr } = await supabaseAdmin.from('campaigns').insert({
        restaurant_id: restaurantId,
        name: 'Relance automatique des inactifs',
        type: 'winback_auto',
        subject: 'Vos avantages vous attendent',
        body: `Relance automatique (inactifs depuis ${winbackDays} j)`,
        content: `Relance automatique (inactifs depuis ${winbackDays} j)`,
        segment: 'inactive_45',
        segment_type: 'inactive_45',
        status: 'sent',
        recipients_count: sentForRestaurant,
      });
      if (campErr) {
        logger.error({ ctx: 'cron/winback', rid: restaurantId, msg: 'campaign accounting insert failed', err: campErr.message });
      }
    }
  }

  logger.info({ ctx: 'cron/winback', msg: `completed: restaurants=${stats.restaurants} sent=${stats.sent} failed=${stats.failed} quota_blocked=${stats.quota_blocked}` });
  return NextResponse.json({ success: true, ...stats });
}
