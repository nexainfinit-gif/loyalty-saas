import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { REMINDER_PACKS, isReminderPackId } from '@/lib/reminder-packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reminders/buy-credits
 * Achète un pack de crédits de rappels WhatsApp (paiement unique, compte
 * Stripe PLATEFORME = revenu Rebites). Body: { pack: 'small' | 'large' }.
 * Retourne { url } vers le Checkout Stripe. Les crédits sont ajoutés par le
 * webhook Stripe à la réception de checkout.session.completed.
 */
export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!isReminderPackId(body?.pack)) {
    return NextResponse.json({ error: 'Pack invalide.' }, { status: 400 });
  }
  const pack = REMINDER_PACKS[body.pack];

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, stripe_customer_id, name')
    .eq('id', guard.restaurantId)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  // Réutilise / crée le client Stripe plateforme (même compteur que l'abonnement).
  let stripeCustomerId = restaurant.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      metadata: { restaurantId: restaurant.id, userId: guard.userId },
      name: restaurant.name ?? undefined,
    });
    stripeCustomerId = customer.id;
    await supabaseAdmin
      .from('restaurants')
      .update({ stripe_customer_id: customer.id })
      .eq('id', restaurant.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: pack.priceCents,
          product_data: { name: `Rebites — ${pack.label} (rappels WhatsApp)` },
        },
      },
    ],
    metadata: {
      restaurantId: restaurant.id,
      type: 'reminder_credits',
      credits: String(pack.credits),
    },
    success_url: `${appUrl}/dashboard/appointments/settings?credits=success`,
    cancel_url: `${appUrl}/dashboard/appointments/settings?credits=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
