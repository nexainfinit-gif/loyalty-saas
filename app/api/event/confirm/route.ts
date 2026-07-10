import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sendEventTicketsEmail } from '@/lib/email';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'event-confirm', limit: 20, windowMs: 60_000 });

const schema = z.object({
  purchaseId: z.string().uuid(),   // id du premier billet de l'achat
  sessionId:  z.string().min(10).max(255),
});

/**
 * POST /api/event/confirm — au retour du Checkout, vérifie le paiement auprès
 * de Stripe (compte connecté) puis valide les billets + envoie l'email.
 * Idempotent : les codes ne sont révélés qu'une fois le paiement prouvé.
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
  const { purchaseId, sessionId } = parsed.data;

  const { data: first } = await supabaseAdmin
    .from('event_tickets')
    .select('id, event_id, restaurant_id, stripe_checkout_session_id')
    .eq('id', purchaseId)
    .maybeSingle();
  if (!first || first.stripe_checkout_session_id !== sessionId) {
    return NextResponse.json({ error: 'Achat introuvable.' }, { status: 404 });
  }

  // Tous les billets de la même session (achat multi-billets)
  const { data: group } = await supabaseAdmin
    .from('event_tickets')
    .select('id, code, buyer_name, buyer_email, status')
    .eq('stripe_checkout_session_id', sessionId)
    .eq('restaurant_id', first.restaurant_id);
  const tickets = group ?? [];
  if (!tickets.length) return NextResponse.json({ error: 'Achat introuvable.' }, { status: 404 });

  // Idempotence : déjà validés → renvoyer les codes
  if (tickets.every(t => t.status === 'valid' || t.status === 'checked_in')) {
    return NextResponse.json({ success: true, codes: tickets.map(t => t.code) });
  }
  if (tickets.some(t => t.status === 'cancelled')) {
    return NextResponse.json({ error: 'Paiement non vérifiable pour cet achat.' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color, stripe_account_id')
    .eq('id', first.restaurant_id)
    .single();
  if (!restaurant?.stripe_account_id) {
    return NextResponse.json({ error: 'Configuration de paiement introuvable.' }, { status: 500 });
  }

  let paid = false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: restaurant.stripe_account_id });
    paid = session.payment_status === 'paid';
  } catch (err) {
    logger.error({ ctx: 'event-confirm', rid: restaurant.id, msg: 'session retrieve failed', err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Vérification du paiement impossible.' }, { status: 502 });
  }
  if (!paid) return NextResponse.json({ error: 'Le paiement n\'est pas finalisé.', paid: false }, { status: 402 });

  await supabaseAdmin
    .from('event_tickets')
    .update({ status: 'valid', paid_at: new Date().toISOString() })
    .eq('stripe_checkout_session_id', sessionId)
    .eq('restaurant_id', first.restaurant_id)
    .eq('status', 'pending_payment');

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('title, location, starts_at')
    .eq('id', first.event_id)
    .single();

  auditLog({
    restaurantId: first.restaurant_id,
    action: 'event_tickets_issued',
    targetType: 'event',
    targetId: first.event_id,
    metadata: { quantity: tickets.length, buyerEmail: tickets[0].buyer_email, free: false, sessionId },
  });

  const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  if (event) {
    sendEventTicketsEmail({
      to: tickets[0].buyer_email,
      buyerName: tickets[0].buyer_name,
      businessName: restaurant.name,
      businessColor: restaurant.primary_color ?? '#111827',
      eventTitle: event.title,
      eventStartsAt: event.starts_at,
      eventLocation: event.location,
      tickets: tickets.map(t => ({
        code: t.code,
        url: `${APP}/fr/event/ticket/${t.code}`,
        walletUrl: `${APP}/api/event/ticket/${t.code}/pkpass`,
      })),
    }).catch(err => logger.error({ ctx: 'event-confirm', rid: restaurant.id, msg: 'email failed', err }));
  }

  return NextResponse.json({ success: true, codes: tickets.map(t => t.code) });
}
