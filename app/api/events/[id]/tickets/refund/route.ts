import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { pushPassUpdate } from '@/lib/apns';
import { auditLog } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ ticketId: z.string().uuid() });

/**
 * POST /api/events/[id]/tickets/refund — rembourse UN billet (owner only,
 * pas le staff : c'est de l'argent).
 *
 * Ordre voulu : verrou d'état AVANT l'argent — la transition atomique
 * valid → refunded gagne ou perd contre un scan simultané à la porte ;
 * on ne crée le refund Stripe (partiel, sur le compte Connect) qu'une
 * fois le billet verrouillé, et on REVERT si Stripe échoue. La commission
 * plateforme n'est pas remboursée (défaut Stripe Connect).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { id: eventId } = await params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Billet invalide.' }, { status: 400 });

  // Isolation multi-tenant : billet de CET événement, de CET établissement.
  const { data: ticket } = await supabaseAdmin
    .from('event_tickets')
    .select('id, code, status, amount, stripe_checkout_session_id')
    .eq('id', parsed.data.ticketId)
    .eq('event_id', eventId)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Billet introuvable.' }, { status: 404 });
  if (ticket.status !== 'valid') {
    return NextResponse.json(
      { error: ticket.status === 'refunded' ? 'Ce billet est déjà remboursé.' : 'Seul un billet valide (non scanné) peut être remboursé.' },
      { status: 409 },
    );
  }

  const amountCents = Math.round(Number(ticket.amount) * 100);

  // 1. Verrou : valid → refunded. Perdre la course contre le scanner ici
  //    évite de rembourser un billet qui vient d'entrer en salle.
  const { data: locked } = await supabaseAdmin
    .from('event_tickets')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('id', ticket.id)
    .eq('status', 'valid')
    .select('id')
    .maybeSingle();
  if (!locked) {
    return NextResponse.json({ error: 'Le billet vient d\'être utilisé ou remboursé — rien n\'a été fait.' }, { status: 409 });
  }

  // 2. Refund Stripe (billets payants uniquement — un billet gratuit se
  //    rembourse en un changement d'état).
  let refundId: string | null = null;
  if (amountCents > 0) {
    try {
      if (!ticket.stripe_checkout_session_id) throw new Error('no_session');
      const { data: resto } = await supabaseAdmin
        .from('restaurants')
        .select('stripe_account_id')
        .eq('id', guard.restaurantId)
        .single();
      if (!resto?.stripe_account_id) throw new Error('no_connect_account');

      const session = await stripe.checkout.sessions.retrieve(
        ticket.stripe_checkout_session_id,
        { stripeAccount: resto.stripe_account_id },
      );
      const paymentIntent = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
      if (!paymentIntent) throw new Error('no_payment_intent');

      // Partiel : un achat multi-billets partage la session — on ne
      // rembourse que le montant de CE billet.
      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntent, amount: amountCents },
        { stripeAccount: resto.stripe_account_id },
      );
      refundId = refund.id;
    } catch (err: unknown) {
      // Revert : l'argent n'est pas parti, le billet redevient valide.
      await supabaseAdmin
        .from('event_tickets')
        .update({ status: 'valid', refunded_at: null })
        .eq('id', ticket.id)
        .eq('status', 'refunded');
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ ctx: 'event-refund', rid: guard.restaurantId, msg: 'stripe refund failed', err: message });
      return NextResponse.json(
        { error: 'Le remboursement Stripe a échoué — le billet reste valide. Réessayez ou vérifiez votre compte Stripe.' },
        { status: 502 },
      );
    }
  }

  // 3. Traçabilité + pass Wallet (badge REMBOURSÉ + notification). Push
  //    AWAITÉ : sur Vercel un fire-and-forget meurt avec la lambda.
  auditLog({
    restaurantId: guard.restaurantId,
    actorId: guard.userId,
    action: 'event_ticket_refund',
    targetType: 'event_ticket',
    targetId: ticket.id,
    metadata: { code: ticket.code, eventId, amountCents, refundId, ip: getClientIp(request) },
  });
  try {
    const { data: pass } = await supabaseAdmin
      .from('wallet_passes')
      .select('id')
      .eq('event_ticket_id', ticket.id)
      .eq('status', 'active')
      .maybeSingle();
    if (pass) await pushPassUpdate(pass.id);
  } catch (err) {
    logger.warn({ ctx: 'event-refund', rid: guard.restaurantId, msg: 'pass push failed', err: String(err) });
  }

  return NextResponse.json({ ok: true, amount: Number(ticket.amount), refundId });
}
