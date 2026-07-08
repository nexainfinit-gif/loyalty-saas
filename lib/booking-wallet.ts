import { supabaseAdmin } from '@/lib/supabase-admin';
import { pushPassUpdate } from '@/lib/apns';
import { logger } from '@/lib/logger';

/**
 * Label FR d'une date de RDV : « Aujourd'hui »/« Demain » quand c'est proche
 * (le changement de texte déclenche la notif Wallet = rappel J-1 gratuit),
 * sinon « mar. 8 juil. ». Partagé entre la carte Wallet et le rappel WhatsApp
 * pour un libellé cohérent.
 */
export function frDateLabel(dateStr: string): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (dateStr === todayStr) return "Aujourd'hui";
  if (dateStr === tomorrowStr) return 'Demain';
  return new Intl.DateTimeFormat('fr-BE', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(`${dateStr}T12:00:00`));
}

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
 *
 * Retourne `true` si le client possède au moins une carte Apple Wallet active
 * (donc « couvert » par la notification gratuite) — signal utilisé par la
 * cascade de rappels pour décider s'il faut basculer sur WhatsApp.
 */
export async function refreshAppointmentOnPass(
  restaurantId: string,
  clientEmail: string | null | undefined,
): Promise<boolean> {
  try {
    if (!clientEmail) return false;
    const email = clientEmail.toLowerCase().trim();

    // 1. Le client a-t-il une fiche customer (donc potentiellement un pass) ?
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('email', email)
      .maybeSingle();
    if (!customer) return false;

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
      // « Aujourd'hui »/« Demain » quand le RDV est proche : le changement de
      // texte déclenche la notification lockscreen (changeMessage) → c'est le
      // RAPPEL J-1 gratuit quand le cron reminders rafraîchit la carte.
      const dateFr = frDateLabel(next.date);
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

    if (!passes?.length) return false;

    for (const pass of passes) {
      if ((pass.promo_message ?? null) === message) continue; // rien à pousser
      await supabaseAdmin
        .from('wallet_passes')
        .update({ promo_message: message })
        .eq('id', pass.id);
      await pushPassUpdate(pass.id).catch(() => { /* push best-effort */ });
    }
    // Le client a une carte Apple active → couvert par la notif Wallet gratuite.
    return true;
  } catch (err) {
    logger.error({
      ctx: 'booking-wallet',
      rid: restaurantId,
      msg: 'refreshAppointmentOnPass failed',
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
