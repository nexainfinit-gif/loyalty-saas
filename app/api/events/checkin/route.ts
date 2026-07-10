import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Anti-fraude : borne les scans en rafale (boucle folle, device compromis)
const limiter = rateLimit({ prefix: 'event-checkin', limit: 60, windowMs: 60_000 });

const schema = z.object({
  code: z.string().trim().toUpperCase().regex(/^EV-[A-Z2-9]{4}-[A-Z2-9]{4}$/, 'Code invalide.'),
  /** Épinglage anti-fraude : si fourni, un billet valide d'un AUTRE
   *  événement est signalé (wrong_event) au lieu d'être admis. */
  eventId: z.string().uuid().optional(),
});

/**
 * POST /api/events/checkin — validation d'un billet à l'entrée (T2).
 * Staff autorisé (c'est lui qui tient la porte). Réponses :
 *  - ok      : billet valide → passé à checked_in (transition ATOMIQUE :
 *              deux scans simultanés ne valident qu'une fois)
 *  - already : billet déjà utilisé (heure du premier passage)
 *  - invalid : inconnu, autre établissement, non payé ou annulé
 */
export async function POST(request: Request) {
  const guard = await requireAuth(request, { allowStaff: true });
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  if (!limiter.check(getClientIp(request)).success) {
    return NextResponse.json({ error: 'Trop de scans. Attendez un instant.' }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ result: 'invalid' });
  const { code, eventId } = parsed.data;

  // Isolation multi-tenant : le billet doit appartenir à CET établissement.
  const { data: ticket } = await supabaseAdmin
    .from('event_tickets')
    .select('id, code, buyer_name, status, checked_in_at, event_id')
    .eq('code', code)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();
  if (!ticket || ticket.status === 'pending_payment' || ticket.status === 'cancelled') {
    return NextResponse.json({ result: 'invalid' });
  }

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, title, starts_at, capacity, status')
    .eq('id', ticket.event_id)
    .single();

  // Événement annulé : ses billets ne donnent plus accès.
  if (event?.status === 'cancelled') {
    return NextResponse.json({ result: 'invalid', reason: 'event_cancelled', eventTitle: event.title });
  }

  // Épinglage : billet valide chez cet organisateur mais pour un AUTRE
  // événement que celui scanné ce soir → signalé, PAS consommé.
  if (eventId && ticket.event_id !== eventId) {
    return NextResponse.json({
      result: 'wrong_event',
      buyerName: ticket.buyer_name,
      eventTitle: event?.title ?? '',
    });
  }

  const counts = async () => {
    const { count } = await supabaseAdmin
      .from('event_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', ticket.event_id)
      .eq('status', 'checked_in');
    const { count: total } = await supabaseAdmin
      .from('event_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', ticket.event_id)
      .in('status', ['valid', 'checked_in']);
    return { checkedIn: count ?? 0, total: total ?? 0 };
  };

  if (ticket.status === 'checked_in') {
    return NextResponse.json({
      result: 'already',
      buyerName: ticket.buyer_name,
      eventTitle: event?.title ?? '',
      checkedInAt: ticket.checked_in_at,
      ...(await counts()),
    });
  }

  // Transition atomique valid → checked_in : le filtre .eq('status','valid')
  // garantit qu'un seul des deux scans concurrents gagne.
  const { data: updated, error } = await supabaseAdmin
    .from('event_tickets')
    .update({ status: 'checked_in', checked_in_at: new Date().toISOString() })
    .eq('id', ticket.id)
    .eq('status', 'valid')
    .select('id')
    .maybeSingle();
  if (error) {
    logger.error({ ctx: 'event-checkin', rid: guard.restaurantId, msg: 'update failed', err: error.message });
    return NextResponse.json({ error: 'Erreur lors de la validation.' }, { status: 500 });
  }
  if (!updated) {
    // Course perdue : quelqu'un vient de le valider.
    return NextResponse.json({
      result: 'already',
      buyerName: ticket.buyer_name,
      eventTitle: event?.title ?? '',
      checkedInAt: new Date().toISOString(),
      ...(await counts()),
    });
  }

  // Traçabilité anti-fraude : qui a validé quoi, quand (fire-and-forget).
  auditLog({
    restaurantId: guard.restaurantId,
    actorId: guard.userId,
    action: 'event_checkin',
    targetType: 'event_ticket',
    targetId: ticket.id,
    metadata: { code: ticket.code, eventId: ticket.event_id, ip: getClientIp(request) },
  });

  return NextResponse.json({
    result: 'ok',
    buyerName: ticket.buyer_name,
    eventTitle: event?.title ?? '',
    ...(await counts()),
  });
}
