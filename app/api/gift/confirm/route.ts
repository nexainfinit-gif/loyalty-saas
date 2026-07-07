import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendGiftVoucherEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

const limiter = rateLimit({ prefix: 'gift-confirm', limit: 20, windowMs: 60_000 });

const schema = z.object({
  voucherId: z.string().uuid(),
  sessionId: z.string().min(10).max(255),
});

/**
 * POST /api/gift/confirm — au retour du Checkout, vérifie le paiement auprès
 * de Stripe (compte connecté) puis active le bon + envoie le code par email.
 * Idempotent. Le code n'est révélé qu'une fois le paiement prouvé.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
  const { voucherId, sessionId } = parsed.data;

  const { data: voucher } = await supabaseAdmin
    .from('gift_vouchers')
    .select('id, restaurant_id, code, amount, buyer_name, buyer_email, recipient_name, message, status, stripe_checkout_session_id, expires_at')
    .eq('id', voucherId)
    .maybeSingle();
  if (!voucher) return NextResponse.json({ error: 'Bon introuvable.' }, { status: 404 });

  // Idempotence : déjà actif → renvoyer le code (même acheteur au retour)
  if (voucher.status === 'active') {
    return NextResponse.json({ success: true, code: voucher.code, amount: voucher.amount, expiresAt: voucher.expires_at });
  }
  if (voucher.status !== 'pending_payment' || voucher.stripe_checkout_session_id !== sessionId) {
    return NextResponse.json({ error: 'Paiement non vérifiable pour ce bon.' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color, stripe_account_id')
    .eq('id', voucher.restaurant_id)
    .single();
  if (!restaurant?.stripe_account_id) {
    return NextResponse.json({ error: 'Configuration de paiement introuvable.' }, { status: 500 });
  }

  let paid = false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: restaurant.stripe_account_id });
    paid = session.payment_status === 'paid';
  } catch (err) {
    logger.error({ ctx: 'gift-confirm', rid: restaurant.id, msg: 'session retrieve failed', err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Vérification du paiement impossible.' }, { status: 502 });
  }
  if (!paid) return NextResponse.json({ error: 'Le paiement n\'est pas finalisé.', paid: false }, { status: 402 });

  await supabaseAdmin
    .from('gift_vouchers')
    .update({ status: 'active', paid_at: new Date().toISOString() })
    .eq('id', voucher.id)
    .eq('status', 'pending_payment');

  sendGiftVoucherEmail({
    to: voucher.buyer_email,
    buyerName: voucher.buyer_name,
    recipientName: voucher.recipient_name,
    personalMessage: voucher.message,
    code: voucher.code,
    amount: Number(voucher.amount),
    expiresAt: voucher.expires_at,
    businessName: restaurant.name,
    businessColor: restaurant.primary_color ?? '#111827',
  }).catch((err) => logger.error({ ctx: 'gift-confirm', rid: restaurant.id, msg: 'email failed', err }));

  return NextResponse.json({ success: true, code: voucher.code, amount: Number(voucher.amount), expiresAt: voucher.expires_at });
}
