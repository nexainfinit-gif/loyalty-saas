import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendPackageEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

const limiter = rateLimit({ prefix: 'package-confirm', limit: 20, windowMs: 60_000 });

const schema = z.object({
  customerPackageId: z.string().uuid(),
  sessionId: z.string().min(10).max(255),
});

/**
 * POST /api/packages/confirm — au retour du Checkout, vérifie le paiement
 * auprès de Stripe (compte connecté), active le forfait + envoie le code.
 * Idempotent : le code n'est révélé qu'une fois le paiement prouvé.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
  const { customerPackageId, sessionId } = parsed.data;

  const { data: cp } = await supabaseAdmin
    .from('customer_packages')
    .select('id, restaurant_id, code, name, customer_name, customer_email, sessions_total, status, stripe_checkout_session_id, expires_at')
    .eq('id', customerPackageId)
    .maybeSingle();
  if (!cp) return NextResponse.json({ error: 'Forfait introuvable.' }, { status: 404 });

  if (cp.status === 'active' || cp.status === 'depleted') {
    return NextResponse.json({ success: true, code: cp.code, name: cp.name, sessions: cp.sessions_total, expiresAt: cp.expires_at });
  }
  if (cp.status !== 'pending_payment' || cp.stripe_checkout_session_id !== sessionId) {
    return NextResponse.json({ error: 'Paiement non vérifiable pour ce forfait.' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color, stripe_account_id')
    .eq('id', cp.restaurant_id)
    .single();
  if (!restaurant?.stripe_account_id) {
    return NextResponse.json({ error: 'Configuration de paiement introuvable.' }, { status: 500 });
  }

  let paid = false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: restaurant.stripe_account_id });
    paid = session.payment_status === 'paid';
  } catch (err) {
    logger.error({ ctx: 'package-confirm', rid: restaurant.id, msg: 'session retrieve failed', err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Vérification du paiement impossible.' }, { status: 502 });
  }
  if (!paid) return NextResponse.json({ error: 'Le paiement n\'est pas finalisé.', paid: false }, { status: 402 });

  await supabaseAdmin
    .from('customer_packages')
    .update({ status: 'active', purchased_at: new Date().toISOString() })
    .eq('id', cp.id)
    .eq('status', 'pending_payment');

  sendPackageEmail({
    to: cp.customer_email,
    customerName: cp.customer_name,
    packageName: cp.name,
    sessions: cp.sessions_total,
    code: cp.code,
    expiresAt: cp.expires_at,
    businessName: restaurant.name,
    businessColor: restaurant.primary_color ?? '#111827',
  }).catch((err) => logger.error({ ctx: 'package-confirm', rid: restaurant.id, msg: 'email failed', err }));

  return NextResponse.json({ success: true, code: cp.code, name: cp.name, sessions: cp.sessions_total, expiresAt: cp.expires_at });
}
