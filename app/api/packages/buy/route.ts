import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generatePackageCode, defaultPackageExpiry } from '@/lib/packages';
import { logger } from '@/lib/logger';

const limiter = rateLimit({ prefix: 'package-buy', limit: 5, windowMs: 60_000 });

const schema = z.object({
  slug:       z.string().trim().min(1).max(120),
  packageId:  z.string().uuid(),
  buyerName:  z.string().trim().min(1).max(100),
  buyerEmail: z.string().trim().email().max(255),
});

/**
 * POST /api/packages/buy — achat public d'un forfait.
 * Paiement Checkout Stripe SUR LE COMPTE CONNECTÉ du commerçant. Le forfait
 * reste pending_payment ; il s'active (code envoyé) via /api/packages/confirm.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Champs invalides.' }, { status: 400 });
  const { slug, packageId, buyerName, buyerEmail } = parsed.data;

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, stripe_account_id, stripe_charges_enabled')
    .eq('slug', slug)
    .maybeSingle();
  if (!restaurant) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { data: kv } = await supabaseAdmin
    .from('restaurant_settings').select('value')
    .eq('restaurant_id', restaurant.id).eq('key', 'packages_enabled').maybeSingle();
  if (kv?.value !== 'true' || !restaurant.stripe_account_id || !restaurant.stripe_charges_enabled) {
    return NextResponse.json({ error: 'Les forfaits ne sont pas disponibles pour cet établissement.' }, { status: 404 });
  }

  // L'offre doit appartenir au restaurant et être active.
  const { data: offer } = await supabaseAdmin
    .from('packages')
    .select('id, name, sessions_count, price')
    .eq('id', packageId)
    .eq('restaurant_id', restaurant.id)
    .eq('active', true)
    .maybeSingle();
  if (!offer) return NextResponse.json({ error: 'Offre introuvable.' }, { status: 404 });

  const cents = Math.round(Number(offer.price) * 100);
  if (cents <= 0) return NextResponse.json({ error: 'Offre invalide.' }, { status: 400 });

  // Purge des achats jamais payés (>30 min).
  await supabaseAdmin
    .from('customer_packages')
    .update({ status: 'cancelled' })
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'pending_payment')
    .lt('created_at', new Date(Date.now() - 30 * 60_000).toISOString());

  // Création du forfait (code unique — retry en cas de collision).
  let cp: { id: string } | null = null;
  for (let attempt = 0; attempt < 3 && !cp; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('customer_packages')
      .insert({
        restaurant_id: restaurant.id,
        package_id: offer.id,
        code: generatePackageCode(),
        name: offer.name,
        customer_name: buyerName,
        customer_email: buyerEmail.toLowerCase(),
        sessions_total: offer.sessions_count,
        status: 'pending_payment',
        expires_at: defaultPackageExpiry(),
      })
      .select('id')
      .single();
    if (data) cp = data;
    else if (error && error.code !== '23505') {
      logger.error({ ctx: 'package-buy', rid: restaurant.id, msg: 'insert failed', err: error.message });
      return NextResponse.json({ error: 'Erreur lors de la création du forfait.' }, { status: 500 });
    }
  }
  if (!cp) return NextResponse.json({ error: 'Erreur lors de la création du forfait.' }, { status: 500 });

  try {
    const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: `Forfait ${offer.name} — ${restaurant.name}` },
            unit_amount: cents,
          },
          quantity: 1,
        }],
        customer_email: buyerEmail,
        metadata: { customer_package_id: cp.id, restaurant_id: restaurant.id, kind: 'package' },
        success_url: `${APP}/fr/package/${restaurant.slug}?cp=${cp.id}&session={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP}/fr/package/${restaurant.slug}?payment=cancelled`,
        expires_at:  Math.floor(Date.now() / 1000) + 30 * 60,
      },
      { stripeAccount: restaurant.stripe_account_id },
    );

    await supabaseAdmin
      .from('customer_packages')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', cp.id);

    return NextResponse.json({ success: true, paymentUrl: session.url, customerPackageId: cp.id });
  } catch (err) {
    logger.error({ ctx: 'package-buy', rid: restaurant.id, msg: 'checkout failed', err: err instanceof Error ? err.message : String(err) });
    await supabaseAdmin.from('customer_packages').update({ status: 'cancelled' }).eq('id', cp.id);
    return NextResponse.json({ error: 'Paiement indisponible pour le moment. Réessayez plus tard.' }, { status: 502 });
  }
}
