import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/packages/[slug] — offres publiques d'un établissement (page de vente).
 * Disponible seulement si les forfaits sont activés (KV packages_enabled) ET
 * l'encaissement Stripe Connect est prêt.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color, stripe_account_id, stripe_charges_enabled')
    .eq('slug', slug)
    .maybeSingle();
  if (!restaurant) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { data: kv } = await supabaseAdmin
    .from('restaurant_settings').select('value')
    .eq('restaurant_id', restaurant.id).eq('key', 'packages_enabled').maybeSingle();
  if (kv?.value !== 'true' || !restaurant.stripe_account_id || !restaurant.stripe_charges_enabled) {
    return NextResponse.json({ error: 'Les forfaits ne sont pas disponibles pour cet établissement.' }, { status: 404 });
  }

  const { data: packages } = await supabaseAdmin
    .from('packages')
    .select('id, name, sessions_count, price')
    .eq('restaurant_id', restaurant.id)
    .eq('active', true)
    .order('price', { ascending: true });

  return NextResponse.json({
    business: { name: restaurant.name, slug: restaurant.slug, primaryColor: restaurant.primary_color },
    packages: packages ?? [],
  });
}
