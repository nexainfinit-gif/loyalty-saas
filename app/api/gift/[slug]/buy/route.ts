import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateVoucherCode, validateGiftAmountCents, defaultExpiry } from '@/lib/gift-vouchers';
import { logger } from '@/lib/logger';

const limiter = rateLimit({ prefix: 'gift-buy', limit: 5, windowMs: 60_000 });

const schema = z.object({
  amount:        z.number(),
  buyerName:     z.string().trim().min(1).max(100),
  buyerEmail:    z.string().trim().email().max(255),
  recipientName: z.string().trim().max(100).optional().nullable(),
  message:       z.string().trim().max(300).optional().nullable(),
});

/**
 * POST /api/gift/[slug]/buy — achat public d'un bon cadeau.
 * Paiement via Checkout Stripe SUR LE COMPTE CONNECTÉ du commerçant.
 * Le bon reste pending_payment ; il devient actif (code envoyé par email)
 * au retour de paiement via /api/gift/confirm.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, { status: 429 });
  }

  const { slug } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Champs invalides.' }, { status: 400 });
  }
  const { amount, buyerName, buyerEmail, recipientName, message } = parsed.data;

  const cents = validateGiftAmountCents(amount);
  if (cents === null) {
    return NextResponse.json({ error: 'Montant invalide (entre 5 € et 500 €).' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, stripe_account_id, stripe_charges_enabled')
    .eq('slug', slug)
    .maybeSingle();
  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }

  const { data: kv } = await supabaseAdmin
    .from('restaurant_settings').select('value')
    .eq('restaurant_id', restaurant.id).eq('key', 'gift_vouchers_enabled').maybeSingle();
  if (kv?.value !== 'true' || !restaurant.stripe_account_id || !restaurant.stripe_charges_enabled) {
    return NextResponse.json({ error: 'Les bons cadeaux ne sont pas disponibles pour cet établissement.' }, { status: 404 });
  }

  // Purge des achats jamais payés (>30 min)
  await supabaseAdmin
    .from('gift_vouchers')
    .update({ status: 'cancelled' })
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'pending_payment')
    .lt('created_at', new Date(Date.now() - 30 * 60_000).toISOString());

  // Création du bon (code unique — retry en cas de collision, improbable)
  let voucher: { id: string } | null = null;
  for (let attempt = 0; attempt < 3 && !voucher; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('gift_vouchers')
      .insert({
        restaurant_id: restaurant.id,
        code: generateVoucherCode(),
        amount: cents / 100,
        buyer_name: buyerName,
        buyer_email: buyerEmail.toLowerCase(),
        recipient_name: recipientName ?? null,
        message: message ?? null,
        status: 'pending_payment',
        expires_at: defaultExpiry(),
      })
      .select('id')
      .single();
    if (data) voucher = data;
    else if (error && error.code !== '23505') {
      logger.error({ ctx: 'gift-buy', rid: restaurant.id, msg: 'insert failed', err: error.message });
      return NextResponse.json({ error: 'Erreur lors de la création du bon.' }, { status: 500 });
    }
  }
  if (!voucher) {
    return NextResponse.json({ error: 'Erreur lors de la création du bon.' }, { status: 500 });
  }

  try {
    const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: `Bon cadeau ${cents / 100} € — ${restaurant.name}` },
            unit_amount: cents,
          },
          quantity: 1,
        }],
        customer_email: buyerEmail,
        metadata: { voucher_id: voucher.id, restaurant_id: restaurant.id, kind: 'gift_voucher' },
        success_url: `${APP}/fr/gift/${restaurant.slug}?voucher=${voucher.id}&session={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP}/fr/gift/${restaurant.slug}?payment=cancelled`,
        expires_at:  Math.floor(Date.now() / 1000) + 30 * 60,
      },
      { stripeAccount: restaurant.stripe_account_id },
    );

    await supabaseAdmin
      .from('gift_vouchers')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', voucher.id);

    return NextResponse.json({ success: true, paymentUrl: session.url, voucherId: voucher.id });
  } catch (err) {
    logger.error({ ctx: 'gift-buy', rid: restaurant.id, msg: 'checkout failed', err: err instanceof Error ? err.message : String(err) });
    await supabaseAdmin.from('gift_vouchers').update({ status: 'cancelled' }).eq('id', voucher.id);
    return NextResponse.json({ error: 'Paiement indisponible pour le moment. Réessayez plus tard.' }, { status: 502 });
  }
}
