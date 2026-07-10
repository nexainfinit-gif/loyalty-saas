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
    .select('id, title, slug, description, location, starts_at, ends_at, capacity, price, offer_loyalty, theme')
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'published')
    .gte('starts_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    .order('starts_at', { ascending: true });

  // Places restantes par événement, comptées en SIÈGES (table VIP de 6 = 6)
  const list = events ?? [];
  const ids = list.map(e => e.id);
  const sold: Record<string, number> = {};
  const soldByTier: Record<string, number> = {};
  if (ids.length) {
    const { data: tickets } = await supabaseAdmin
      .from('event_tickets')
      .select('event_id, tier_id, seats')
      .in('event_id', ids)
      .in('status', ['valid', 'checked_in']);
    for (const t of tickets ?? []) {
      sold[t.event_id] = (sold[t.event_id] ?? 0) + (t.seats ?? 1);
      if (t.tier_id) soldByTier[t.tier_id] = (soldByTier[t.tier_id] ?? 0) + 1;
    }
  }

  // Catégories de billets actives (049) — prix/dispo par catégorie
  const tiersByEvent: Record<string, {
    id: string; name: string; description: string | null; price: number;
    kind: string; seatsPerUnit: number; remaining: number | null;
  }[]> = {};
  if (ids.length) {
    const { data: tiers } = await supabaseAdmin
      .from('event_ticket_tiers')
      .select('id, event_id, name, description, price, capacity, kind, seats_per_unit, sort_order')
      .in('event_id', ids)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    for (const t of tiers ?? []) {
      (tiersByEvent[t.event_id] ??= []).push({
        id: t.id,
        name: t.name,
        description: t.description,
        price: Number(t.price),
        kind: t.kind,
        seatsPerUnit: t.seats_per_unit ?? 1,
        remaining: t.capacity == null ? null : Math.max(0, t.capacity - (soldByTier[t.id] ?? 0)),
      });
    }
  }

  const visible = list
    // Payant (tarif unique OU une catégorie payante) → Stripe Connect requis
    .filter(e => {
      const tiers = tiersByEvent[e.id] ?? [];
      const hasPaid = tiers.length > 0 ? tiers.some(t => t.price > 0) : Number(e.price) > 0;
      return !hasPaid || canCharge;
    })
    .map(e => ({
      ...e,
      price: Number(e.price),
      remaining: e.capacity == null ? null : Math.max(0, e.capacity - (sold[e.id] ?? 0)),
      tiers: tiersByEvent[e.id] ?? [],
    }));

  return NextResponse.json({
    name: restaurant.name,
    city: restaurant.city,
    primaryColor: restaurant.primary_color,
    logoUrl: restaurant.logo_url,
    // Habillage de la page = thème du PROCHAIN événement (chaque événement
    // porte le sien — un concert et un séminaire ne se présentent pas pareil).
    theme: visible[0]?.theme ?? 'nuit',
    events: visible,
  });
}
