import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for upgrading to a paid plan.
 * Body: { planId: string }
 * Returns: { url: string }
 */
export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.planId || typeof body.planId !== 'string') {
    return NextResponse.json({ error: 'planId requis.' }, { status: 400 });
  }

  // Verify the plan exists, is active, public, and has a Stripe price
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, key, stripe_price_id')
    .eq('id', body.planId)
    .eq('is_public', true)
    .eq('is_active', true)
    .maybeSingle();

  if (!plan || !plan.stripe_price_id) {
    return NextResponse.json(
      { error: 'Plan invalide ou non payant.' },
      { status: 400 },
    );
  }

  // Get or create Stripe customer
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, stripe_customer_id, name')
    .eq('id', guard.restaurantId)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  let stripeCustomerId = restaurant.stripe_customer_id;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      metadata: {
        restaurantId: restaurant.id,
        userId: guard.userId,
      },
      name: restaurant.name ?? undefined,
    });
    stripeCustomerId = customer.id;

    await supabaseAdmin
      .from('restaurants')
      .update({ stripe_customer_id: customer.id })
      .eq('id', restaurant.id);
  }

  // Create Checkout Session
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    metadata: {
      restaurantId: restaurant.id,
      planId: plan.id,
      planKey: plan.key,
    },
    subscription_data: {
      metadata: {
        restaurantId: restaurant.id,
        planId: plan.id,
        planKey: plan.key,
      },
    },
    success_url: `${appUrl}/dashboard?billing=success`,
    cancel_url: `${appUrl}/dashboard?billing=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
