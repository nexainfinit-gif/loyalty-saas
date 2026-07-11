import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateTicketCode } from '@/lib/events';
import { sendEventTicketsEmail } from '@/lib/email';
import { pushPassUpdate } from '@/lib/apns';
import { auditLog } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  ticketId:   z.string().uuid(),
  buyerName:  z.string().trim().min(1, 'Nom requis.').max(80),
  buyerEmail: z.string().trim().toLowerCase().email('Email invalide.').max(255),
});

/**
 * POST /api/events/[id]/tickets/transfer — transfère UN billet vers un
 * nouveau titulaire (owner only).
 *
 * L'ancien billet est void (badge TRANSFÉRÉ sur son pass, push APNS) et un
 * NOUVEAU billet — nouveau code, nouveau QR — part par email au
 * destinataire : l'ancien QR ne peut plus entrer, même s'il a été
 * screenshoté. Lignée conservée (transferred_to_ticket_id) ; le nouveau
 * billet hérite du paiement (montant + session Stripe) → il reste
 * remboursable normalement.
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
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(i => i.message).join(', ') }, { status: 400 });
  }
  const { ticketId, buyerName, buyerEmail } = parsed.data;

  // Isolation multi-tenant + données à hériter sur le nouveau billet.
  const { data: ticket } = await supabaseAdmin
    .from('event_tickets')
    .select('id, code, status, amount, stripe_checkout_session_id, paid_at, tier_id, tier_name, seats, buyer_name')
    .eq('id', ticketId)
    .eq('event_id', eventId)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Billet introuvable.' }, { status: 404 });
  if (ticket.status !== 'valid') {
    return NextResponse.json(
      { error: ticket.status === 'transferred' ? 'Ce billet a déjà été transféré.' : 'Seul un billet valide (non scanné) peut être transféré.' },
      { status: 409 },
    );
  }

  const [{ data: event }, { data: restaurant }] = await Promise.all([
    supabaseAdmin.from('events').select('title, starts_at, location, status').eq('id', eventId).single(),
    supabaseAdmin.from('restaurants').select('name, primary_color').eq('id', guard.restaurantId).single(),
  ]);
  if (!event || !restaurant) return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });
  if (event.status === 'cancelled') {
    return NextResponse.json({ error: 'Événement annulé — remboursez le billet plutôt que de le transférer.' }, { status: 409 });
  }

  // 1. Verrou : valid → transferred. Perdre la course contre un scan à la
  //    porte évite d'émettre un doublon pour un billet qui vient d'entrer.
  const { data: locked } = await supabaseAdmin
    .from('event_tickets')
    .update({ status: 'transferred', transferred_at: new Date().toISOString() })
    .eq('id', ticket.id)
    .eq('status', 'valid')
    .select('id')
    .maybeSingle();
  if (!locked) {
    return NextResponse.json({ error: 'Le billet vient d\'être utilisé ou modifié — rien n\'a été fait.' }, { status: 409 });
  }

  // 2. Nouveau billet — nouveau code/QR, mêmes droits (tier, places, montant,
  //    lignée de paiement pour un éventuel remboursement futur).
  let newTicket: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 3 && !newTicket; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('event_tickets')
      .insert({
        event_id:      eventId,
        restaurant_id: guard.restaurantId,
        code:          generateTicketCode(),
        buyer_name:    buyerName,
        buyer_email:   buyerEmail,
        amount:        ticket.amount,
        status:        'valid',
        stripe_checkout_session_id: ticket.stripe_checkout_session_id,
        paid_at:       ticket.paid_at,
        tier_id:       ticket.tier_id,
        tier_name:     ticket.tier_name,
        seats:         ticket.seats,
      })
      .select('id, code')
      .single();
    if (data) { newTicket = data; break; }
    if (error && error.code !== '23505') break; // 23505 = collision de code → retente
  }
  if (!newTicket) {
    // Revert : l'ancien billet redevient valide, rien n'est parti.
    await supabaseAdmin
      .from('event_tickets')
      .update({ status: 'valid', transferred_at: null })
      .eq('id', ticket.id)
      .eq('status', 'transferred');
    logger.error({ ctx: 'event-transfer', rid: guard.restaurantId, msg: 'new ticket insert failed', ticketId: ticket.id });
    return NextResponse.json({ error: 'Le transfert a échoué — le billet reste valide. Réessayez.' }, { status: 500 });
  }

  // 3. Lignée : de quel billet celui-ci est-il le remplacement.
  await supabaseAdmin
    .from('event_tickets')
    .update({ transferred_to_ticket_id: newTicket.id })
    .eq('id', ticket.id);

  auditLog({
    restaurantId: guard.restaurantId,
    actorId: guard.userId,
    action: 'event_ticket_transfer',
    targetType: 'event_ticket',
    targetId: ticket.id,
    metadata: { code: ticket.code, newTicketId: newTicket.id, newCode: newTicket.code, to: buyerEmail, eventId, ip: getClientIp(request) },
  });

  // 4. Livraison au nouveau titulaire + pass de l'ancien void (push).
  //    Les deux sont AWAITÉS (Vercel tue le fire-and-forget) mais aucun ne
  //    fait échouer le transfert : le nouveau code existe déjà en base.
  const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    await sendEventTicketsEmail({
      to: buyerEmail,
      buyerName,
      businessName: restaurant.name,
      businessColor: restaurant.primary_color ?? '#111827',
      eventTitle: event.title,
      eventStartsAt: event.starts_at,
      eventLocation: event.location,
      tickets: [{
        code: newTicket.code,
        url: `${APP}/fr/event/ticket/${newTicket.code}`,
        walletUrl: `${APP}/api/event/ticket/${newTicket.code}/pkpass`,
        label: ticket.tier_name
          ? ((ticket.seats ?? 1) > 1 ? `${ticket.tier_name} · ${ticket.seats} places` : ticket.tier_name)
          : undefined,
      }],
    });
  } catch (err) {
    logger.error({ ctx: 'event-transfer', rid: guard.restaurantId, msg: 'email failed', err: String(err) });
  }
  try {
    const { data: pass } = await supabaseAdmin
      .from('wallet_passes')
      .select('id')
      .eq('event_ticket_id', ticket.id)
      .eq('status', 'active')
      .maybeSingle();
    if (pass) await pushPassUpdate(pass.id);
  } catch (err) {
    logger.warn({ ctx: 'event-transfer', rid: guard.restaurantId, msg: 'pass push failed', err: String(err) });
  }

  return NextResponse.json({ ok: true, newCode: newTicket.code });
}
