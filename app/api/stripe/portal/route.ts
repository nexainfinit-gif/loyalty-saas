import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/portal
 * Creates a Stripe Billing Portal session for the current restaurant.
 * Returns: { url: string }
 */
export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  // Get the restaurant's Stripe customer ID
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('stripe_customer_id')
    .eq('id', guard.restaurantId)
    .single();

  if (!restaurant?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'Aucun abonnement Stripe trouvé. Veuillez d\'abord souscrire à un plan.' },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: restaurant.stripe_customer_id,
    return_url: `${appUrl}/dashboard?tab=settings`,
  });

  return NextResponse.json({ url: portalSession.url });
}
