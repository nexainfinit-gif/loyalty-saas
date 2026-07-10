import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Stripe Connect Express — chaque commerçant encaisse sur SON compte Stripe.
 *
 * Utilisé par les acomptes de réservation (et plus tard les bons cadeaux) :
 * les paiements clients vont directement au commerçant, pas à la plateforme.
 * Onboarding hébergé par Stripe (Account Link) — zéro donnée bancaire chez nous.
 */

export type ConnectStatus = {
  accountId: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

/** Crée (si besoin) le compte Express du restaurant et retourne son id. */
export async function ensureConnectAccount(restaurantId: string): Promise<string> {
  const { data: resto } = await supabaseAdmin
    .from('restaurants')
    .select('stripe_account_id, name')
    .eq('id', restaurantId)
    .single();

  if (resto?.stripe_account_id) return resto.stripe_account_id;

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'BE',
    business_profile: { name: resto?.name ?? undefined },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { restaurant_id: restaurantId },
  });

  const { error: updErr } = await supabaseAdmin
    .from('restaurants')
    .update({ stripe_account_id: account.id })
    .eq('id', restaurantId);

  if (updErr) {
    // Colonne absente (migration 039 non appliquée) ou échec DB : on annule le
    // compte Stripe fraîchement créé pour ne pas laisser d'orphelin, et on
    // remonte une erreur claire.
    await stripe.accounts.del(account.id).catch(() => {});
    throw new Error(`Impossible d'enregistrer le compte Stripe (migration 039 appliquée ?) : ${updErr.message}`);
  }

  return account.id;
}

/** Lien d'onboarding hébergé Stripe (expire vite — généré à la demande). */
export async function createOnboardingLink(
  accountId: string,
  locale: string,
  // Page de retour selon le contexte (réglages booking par défaut ;
  // les organisateurs Rebites Events reviennent sur leurs événements).
  returnPath: string = '/dashboard/appointments/settings',
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/${locale}${returnPath}?connect=refresh`,
    return_url:  `${appUrl}/${locale}${returnPath}?connect=done`,
    type: 'account_onboarding',
  });
  return link.url;
}

/**
 * Statut du compte connecté — rafraîchit stripe_charges_enabled en base
 * (source de vérité côté Stripe, mis en cache chez nous pour le flux booking).
 */
export async function getConnectStatus(restaurantId: string): Promise<ConnectStatus> {
  const { data: resto } = await supabaseAdmin
    .from('restaurants')
    .select('stripe_account_id, stripe_charges_enabled')
    .eq('id', restaurantId)
    .single();

  if (!resto?.stripe_account_id) {
    return { accountId: null, chargesEnabled: false, detailsSubmitted: false };
  }

  const account = await stripe.accounts.retrieve(resto.stripe_account_id);
  const chargesEnabled = account.charges_enabled === true;

  if (chargesEnabled !== resto.stripe_charges_enabled) {
    await supabaseAdmin
      .from('restaurants')
      .update({ stripe_charges_enabled: chargesEnabled })
      .eq('id', restaurantId);
  }

  return {
    accountId: resto.stripe_account_id,
    chargesEnabled,
    detailsSubmitted: account.details_submitted === true,
  };
}

/* ── Acomptes ─────────────────────────────────────────────────────────────── */

/**
 * Montant d'acompte en centimes pour un service donné.
 * fixed = montant en € ; percent = % du prix du service.
 * Retourne null si non applicable (montant < minimum Stripe 0,50 €).
 */
export function computeDepositCents(
  settings: { deposit_enabled?: boolean; deposit_type?: string; deposit_value?: number },
  servicePriceEur: number,
): number | null {
  if (!settings.deposit_enabled) return null;
  const value = Number(settings.deposit_value ?? 0);
  const eur = settings.deposit_type === 'percent'
    ? (servicePriceEur * value) / 100
    : value;
  const cents = Math.round(eur * 100);
  return cents >= 50 ? cents : null; // minimum Stripe
}
