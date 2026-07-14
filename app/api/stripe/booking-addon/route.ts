import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/booking-addon — active/désactive l'add-on mensuel
 * « Rebites Booking » en ajoutant/retirant une 2ᵉ ligne à l'abonnement
 * existant de l'établissement. Body: { active: boolean }.
 * Auth : gérant (owner / restaurant_admin) — requireAuth refuse le staff.
 */
export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const addonPrice = process.env.STRIPE_BOOKING_ADDON_PRICE_ID;
  if (!addonPrice) {
    return NextResponse.json({ error: 'Add-on Booking non configuré (STRIPE_BOOKING_ADDON_PRICE_ID).' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.active !== 'boolean') {
    return NextResponse.json({ error: 'active (booléen) requis.' }, { status: 400 });
  }
  const activate = body.active as boolean;

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, stripe_subscription_id')
    .eq('id', guard.restaurantId)
    .single();

  if (!restaurant?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Un abonnement actif est requis pour activer Rebites Booking.' }, { status: 400 });
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(restaurant.stripe_subscription_id);
    const existing = (subscription.items?.data ?? []).find(
      (it: Stripe.SubscriptionItem) => it.price?.id === addonPrice,
    );

    if (activate) {
      if (!existing) {
        await stripe.subscriptionItems.create({
          subscription: restaurant.stripe_subscription_id,
          price: addonPrice,
          quantity: 1,
          proration_behavior: 'create_prorations',
        });
      }
      await supabaseAdmin.from('restaurants').update({ booking_active: true }).eq('id', restaurant.id);
      return NextResponse.json({ ok: true, active: true });
    }

    // Désactivation : retirer la ligne add-on (la ligne du plan reste).
    if (existing) {
      await stripe.subscriptionItems.del(existing.id, { proration_behavior: 'create_prorations' });
    }
    await supabaseAdmin.from('restaurants').update({ booking_active: false }).eq('id', restaurant.id);
    return NextResponse.json({ ok: true, active: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur Stripe';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
