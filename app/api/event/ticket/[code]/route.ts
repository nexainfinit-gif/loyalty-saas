import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'event-ticket', limit: 30, windowMs: 60_000 });

/**
 * GET /api/event/ticket/[code] — infos publiques d'un billet pour la page QR.
 * Le code EST le secret (équivalent bon cadeau) ; on n'expose que le
 * nécessaire à l'affichage du billet.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const { code } = await params;
  if (!/^EV-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
    return NextResponse.json({ error: 'Billet introuvable.' }, { status: 404 });
  }

  const { data: ticket } = await supabaseAdmin
    .from('event_tickets')
    .select('code, buyer_name, status, event_id, restaurant_id, tier_name, seats')
    .eq('code', code)
    .maybeSingle();
  if (!ticket || ticket.status === 'pending_payment' || ticket.status === 'cancelled') {
    return NextResponse.json({ error: 'Billet introuvable.' }, { status: 404 });
  }

  const [{ data: event }, { data: restaurant }] = await Promise.all([
    supabaseAdmin.from('events').select('title, location, starts_at, theme').eq('id', ticket.event_id).single(),
    supabaseAdmin.from('restaurants').select('name, primary_color, logo_url').eq('id', ticket.restaurant_id).single(),
  ]);
  if (!event || !restaurant) {
    return NextResponse.json({ error: 'Billet introuvable.' }, { status: 404 });
  }

  return NextResponse.json({
    code: ticket.code,
    buyerName: ticket.buyer_name,
    status: ticket.status,
    tierName: ticket.tier_name ?? null,
    seats: ticket.seats ?? 1,
    theme: event.theme || 'nuit',
    event: { title: event.title, location: event.location, startsAt: event.starts_at },
    business: { name: restaurant.name, primaryColor: restaurant.primary_color, logoUrl: restaurant.logo_url },
  });
}
