import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { BOOKING_ELIGIBLE_TYPES } from '@/lib/booking-eligibility';
import { verifyRwgAuth, buildMerchantFeed, buildServicesFeed } from '@/lib/reserve-with-google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/rwg/feeds?type=merchant|service
 * Feeds Reserve with Google (marchands / services) pour tous les établissements
 * éligibles à la réservation. Protégé par le jeton partagé RWG_AUTH_TOKEN.
 */
export async function GET(request: Request) {
  if (!verifyRwgAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = new URL(request.url).searchParams.get('type') ?? 'merchant';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebites.be';
  const eligible = Array.from(BOOKING_ELIGIBLE_TYPES);

  const { data: restaurants } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, business_type')
    .in('business_type', eligible);

  const ids = (restaurants ?? []).map((r) => r.id);

  if (type === 'service') {
    if (ids.length === 0) return NextResponse.json(buildServicesFeed([]));
    const { data: services } = await supabaseAdmin
      .from('services')
      .select('id, restaurant_id, name, description, duration_minutes, price')
      .in('restaurant_id', ids)
      .eq('active', true);
    return NextResponse.json(buildServicesFeed(services ?? []));
  }

  return NextResponse.json(buildMerchantFeed(restaurants ?? [], appUrl));
}
