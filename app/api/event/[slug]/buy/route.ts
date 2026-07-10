import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateTicketCode, platformFeeCents, validateQuantity, TICKET_MAX_QTY } from '@/lib/events';
import { auditLog } from '@/lib/audit';
import { sendEventTicketsEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'event-buy', limit: 5, windowMs: 60_000 });

const schema = z.object({
  eventId:     z.string().uuid(),
  quantity:    z.number(),
  buyerName:   z.string().trim().min(1).max(100),
  buyerEmail:  z.string().trim().email().max(255),
  joinLoyalty: z.boolean().optional(),
});

/**
 * POST /api/event/[slug]/buy — achat public de billets.
 * Gratuit : billets émis immédiatement (email envoyé).
 * Payant : Checkout Stripe sur le compte CONNECTÉ du commerçant, avec
 * commission plateforme (application_fee_amount) — billets pending_payment
 * jusqu'à /api/event/confirm.
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
  if (!parsed.success) return NextResponse.json({ error: 'Champs invalides.' }, { status: 400 });
  const { eventId, buyerName, buyerEmail, joinLoyalty } = parsed.data;

  const quantity = validateQuantity(parsed.data.quantity);
  if (quantity === null) {
    return NextResponse.json({ error: 'Quantité invalide (1 à 6 billets).' }, { status: 400 });
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color, products, stripe_account_id, stripe_charges_enabled')
    .eq('slug', slug)
    .maybeSingle();
  if (!restaurant || !(restaurant.products ?? []).includes('ticketing')) {
    return NextResponse.json({ error: 'Billetterie indisponible pour cet établissement.' }, { status: 404 });
  }

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, title, slug, location, starts_at, capacity, price, status, offer_loyalty')
    .eq('id', eventId)
    .eq('restaurant_id', restaurant.id)
    .maybeSingle();
  if (!event || event.status !== 'published') {
    return NextResponse.json({ error: 'Événement introuvable ou non disponible.' }, { status: 404 });
  }
  if (new Date(event.starts_at).getTime() < Date.now() - 6 * 3600_000) {
    return NextResponse.json({ error: 'Cet événement est terminé.' }, { status: 400 });
  }

  const priceCents = Math.round(Number(event.price) * 100);
  const isFree = priceCents <= 0;
  if (!isFree && (!restaurant.stripe_account_id || !restaurant.stripe_charges_enabled)) {
    return NextResponse.json({ error: 'Paiement indisponible pour cet événement.' }, { status: 503 });
  }

  // Purge des achats jamais payés (>30 min) puis contrôle de capacité
  await supabaseAdmin
    .from('event_tickets')
    .update({ status: 'cancelled' })
    .eq('event_id', event.id)
    .eq('status', 'pending_payment')
    .lt('created_at', new Date(Date.now() - 30 * 60_000).toISOString());

  if (event.capacity != null) {
    const { count } = await supabaseAdmin
      .from('event_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .in('status', ['valid', 'checked_in', 'pending_payment']);
    if ((count ?? 0) + quantity > event.capacity) {
      return NextResponse.json({ error: 'Plus assez de places disponibles.' }, { status: 409 });
    }
  }

  // Anti-fraude : plafond de billets PAR EMAIL et par événement (bloque
  // l'accaparement de billets gratuits par le même acheteur — 6 max, comme
  // la quantité maximale d'un achat).
  const { count: byEmail } = await supabaseAdmin
    .from('event_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .eq('buyer_email', buyerEmail.toLowerCase())
    .in('status', ['valid', 'checked_in', 'pending_payment']);
  if ((byEmail ?? 0) + quantity > TICKET_MAX_QTY) {
    return NextResponse.json(
      { error: `Limite de ${TICKET_MAX_QTY} billets par personne pour cet événement.` },
      { status: 409 },
    );
  }

  // Création des billets (un code unique par billet)
  const rows = Array.from({ length: quantity }, () => ({
    event_id: event.id,
    restaurant_id: restaurant.id,
    code: generateTicketCode(),
    buyer_name: buyerName,
    buyer_email: buyerEmail.toLowerCase(),
    amount: priceCents / 100,
    status: isFree ? 'valid' : 'pending_payment',
    paid_at: isFree ? new Date().toISOString() : null,
  }));
  const { data: tickets, error: insertErr } = await supabaseAdmin
    .from('event_tickets')
    .insert(rows)
    .select('id, code');
  if (insertErr || !tickets?.length) {
    logger.error({ ctx: 'event-buy', rid: restaurant.id, msg: 'insert failed', err: insertErr?.message });
    return NextResponse.json({ error: 'Erreur lors de la réservation des billets.' }, { status: 500 });
  }

  // Opt-in fidélité (RGPD : case cochée par l'acheteur) — hybrides uniquement
  if (joinLoyalty && event.offer_loyalty && (restaurant.products ?? []).includes('loyalty')) {
    try {
      const email = buyerEmail.toLowerCase();
      const { data: existing } = await supabaseAdmin
        .from('customers').select('id')
        .eq('restaurant_id', restaurant.id).eq('email', email).maybeSingle();
      if (!existing) {
        const [firstName, ...rest] = buyerName.trim().split(/\s+/);
        await supabaseAdmin.from('customers').insert({
          restaurant_id: restaurant.id,
          first_name: firstName,
          last_name: rest.join(' ') || '',
          email,
          qr_token: crypto.randomUUID(),
          consent_marketing: false,
        });
      }
    } catch (err) {
      logger.warn({ ctx: 'event-buy', rid: restaurant.id, msg: 'loyalty enroll failed', err: err instanceof Error ? err.message : String(err) });
    }
  }

  const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (isFree) {
    auditLog({
      restaurantId: restaurant.id,
      action: 'event_tickets_issued',
      targetType: 'event',
      targetId: event.id,
      metadata: { quantity, buyerEmail: buyerEmail.toLowerCase(), free: true, ip },
    });
    sendEventTicketsEmail({
      to: buyerEmail,
      buyerName,
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
    }).catch(err => logger.error({ ctx: 'event-buy', rid: restaurant.id, msg: 'email failed', err }));
    return NextResponse.json({ success: true, free: true, codes: tickets.map(t => t.code) });
  }

  try {
    const fee = platformFeeCents(priceCents, quantity);
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: `${event.title} — ${restaurant.name}` },
            unit_amount: priceCents,
          },
          quantity,
        }],
        customer_email: buyerEmail,
        payment_intent_data: { application_fee_amount: fee },
        metadata: { event_id: event.id, restaurant_id: restaurant.id, kind: 'event_tickets' },
        success_url: `${APP}/fr/event/${restaurant.slug}?purchase=${tickets[0].id}&session={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP}/fr/event/${restaurant.slug}?payment=cancelled`,
        expires_at:  Math.floor(Date.now() / 1000) + 30 * 60,
      },
      { stripeAccount: restaurant.stripe_account_id! },
    );

    await supabaseAdmin
      .from('event_tickets')
      .update({ stripe_checkout_session_id: session.id })
      .in('id', tickets.map(t => t.id));

    return NextResponse.json({ success: true, paymentUrl: session.url, purchaseId: tickets[0].id });
  } catch (err) {
    logger.error({ ctx: 'event-buy', rid: restaurant.id, msg: 'checkout failed', err: err instanceof Error ? err.message : String(err) });
    await supabaseAdmin.from('event_tickets').update({ status: 'cancelled' }).in('id', tickets.map(t => t.id));
    return NextResponse.json({ error: 'Paiement indisponible pour le moment. Réessayez plus tard.' }, { status: 502 });
  }
}
