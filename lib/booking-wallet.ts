import { supabaseAdmin } from '@/lib/supabase-admin';
import { pushPassUpdate } from '@/lib/apns';
import { logger } from '@/lib/logger';

/**
 * Synchronise le prochain rendez-vous d'un client sur sa carte Wallet.
 *
 * Différenciateur Rebites : le pass affiche « 📅 Prochain RDV : mar. 8 juil.
 * à 14:30 — Coupe Femme » au dos, et iOS déclenche une notification
 * lockscreen à chaque changement (mécanisme changeMessage) — un rappel de
 * rendez-vous gratuit, sans SMS.
 *
 * Idempotent : recalcule depuis la base le prochain RDV confirmé du client
 * (par email, scope restaurant) et écrit le message sur ses passes Apple
 * actifs (ou l'efface s'il n'y a plus de RDV à venir). À appeler après
 * création / annulation / report / changement de statut d'un rendez-vous.
 *
 * Ne lève JAMAIS : les flux de réservation ne doivent pas échouer à cause
 * de la synchronisation Wallet.
 */
export async function refreshAppointmentOnPass(
  restaurantId: string,
  clientEmail: string | null | undefined,
): Promise<void> {
  try {
    if (!clientEmail) return;
    const email = clientEmail.toLowerCase().trim();

    // 1. Le client a-t-il une fiche customer (donc potentiellement un pass) ?
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('email', email)
      .maybeSingle();
    if (!customer) return;

    // 2. Prochain RDV confirmé (aujourd'hui inclus)
    const today = new Date().toISOString().slice(0, 10);
    const { data: next } = await supabaseAdmin
      .from('appointments')
      .select('date, start_time, service_id')
      .eq('restaurant_id', restaurantId)
      .eq('client_email', email)
      .eq('status', 'confirmed')
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    let message: string | null = null;
    if (next) {
      let serviceName = '';
      if (next.service_id) {
        const { data: svc } = await supabaseAdmin
          .from('services')
          .select('name')
          .eq('id', next.service_id)
          .maybeSingle();
        serviceName = svc?.name ?? '';
      }
      const dateFr = new Intl.DateTimeFormat('fr-BE', {
        weekday: 'short', day: 'numeric', month: 'short',
      }).format(new Date(`${next.date}T12:00:00`));
      const time = String(next.start_time).slice(0, 5);
      // Préfixe 📅 : convention lue par buildPassJson pour afficher le label
      // « Prochain rendez-vous » au lieu de « Offre du moment ».
      message = `📅 ${dateFr} à ${time}${serviceName ? ` — ${serviceName}` : ''}`;
    }

    // 3. Écrire sur les passes Apple actifs + push APNS (notif lockscreen)
    const { data: passes } = await supabaseAdmin
      .from('wallet_passes')
      .select('id, promo_message')
      .eq('restaurant_id', restaurantId)
      .eq('customer_id', customer.id)
      .eq('platform', 'apple')
      .eq('status', 'active');

    if (!passes?.length) return;

    for (const pass of passes) {
      if ((pass.promo_message ?? null) === message) continue; // rien à pousser
      await supabaseAdmin
        .from('wallet_passes')
        .update({ promo_message: message })
        .eq('id', pass.id);
      await pushPassUpdate(pass.id).catch(() => { /* push best-effort */ });
    }
  } catch (err) {
    logger.error({
      ctx: 'booking-wallet',
      rid: restaurantId,
      msg: 'refreshAppointmentOnPass failed',
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
