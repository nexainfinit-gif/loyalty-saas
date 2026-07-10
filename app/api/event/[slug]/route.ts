import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'event-info', limit: 30, windowMs: 60_000 });

/**
 * GET /api/event/[slug] — page publique billetterie d'un établissement :
 * branding + événements publiés à venir. Disponible si l'établissement a le
 * produit `ticketing`. Les événements payants exigent Stripe Connect actif.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const { slug } = await params;
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, city, primary_color, logo_url, products, stripe_account_id, stripe_charges_enabled')
    .eq('slug', slug)
    .maybeSingle();
  if (!restaurant || !(restaurant.products ?? []).includes('ticketing')) {
    return NextResponse.json({ error: 'Billetterie indisponible pour cet établissement.' }, { status: 404 });
  }

  const canCharge = !!restaurant.stripe_account_id && restaurant.stripe_charges_enabled === true;

  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, title, slug, description, location, starts_at, ends_at, capacity, price, offer_loyalty')
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'published')
    .gte('starts_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    .order('starts_at', { ascending: true });

  // Places restantes par événement (billets valides + check-in)
  const list = events ?? [];
  const ids = list.map(e => e.id);
  const sold: Record<string, number> = {};
  if (ids.length) {
    const { data: tickets } = await supabaseAdmin
      .from('event_tickets')
      .select('event_id')
      .in('event_id', ids)
      .in('status', ['valid', 'checked_in']);
    for (const t of tickets ?? []) sold[t.event_id] = (sold[t.event_id] ?? 0) + 1;
  }

  return NextResponse.json({
    name: restaurant.name,
    city: restaurant.city,
    primaryColor: restaurant.primary_color,
    logoUrl: restaurant.logo_url,
    events: list
      // Les événements payants ne sont proposables que si l'encaissement marche
      .filter(e => Number(e.price) === 0 || canCharge)
      .map(e => ({
        ...e,
        price: Number(e.price),
        remaining: e.capacity == null ? null : Math.max(0, e.capacity - (sold[e.id] ?? 0)),
      })),
  });
}
