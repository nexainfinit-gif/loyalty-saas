import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ prefix: 'gift-info', limit: 30, windowMs: 60_000 });

/**
 * GET /api/gift/[slug] — infos publiques pour la page d'achat de bon cadeau.
 * Disponible si le commerçant a activé les bons cadeaux (KV
 * gift_vouchers_enabled) ET peut encaisser (Stripe Connect opérationnel).
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
    .select('id, name, primary_color, logo_url, stripe_account_id, stripe_charges_enabled')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }

  const { data: kv } = await supabaseAdmin
    .from('restaurant_settings')
    .select('value')
    .eq('restaurant_id', restaurant.id)
    .eq('key', 'gift_vouchers_enabled')
    .maybeSingle();

  const enabled =
    kv?.value === 'true' &&
    !!restaurant.stripe_account_id &&
    restaurant.stripe_charges_enabled === true;

  if (!enabled) {
    return NextResponse.json(
      { error: 'Les bons cadeaux ne sont pas disponibles pour cet établissement.' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    name: restaurant.name,
    primaryColor: restaurant.primary_color,
    logoUrl: restaurant.logo_url,
  });
}
