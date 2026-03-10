import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

/**
 * GET /api/appointments/no-show-stats?email=...
 *
 * Returns no-show count for a specific client email within the restaurant.
 * Used by DetailModal to show no-show warnings.
 *
 * GET /api/appointments/no-show-stats (no email param)
 *
 * Returns all no-show stats for the restaurant (for CRM badge display).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (email) {
    // Single client lookup
    const { data } = await supabaseAdmin
      .from('client_no_show_stats')
      .select('no_show_count, last_no_show_at')
      .eq('restaurant_id', auth.restaurantId)
      .eq('client_email', email.toLowerCase().trim())
      .single();

    return NextResponse.json({
      noShowCount: data?.no_show_count ?? 0,
      lastNoShowAt: data?.last_no_show_at ?? null,
    });
  }

  // All clients with no-shows for this restaurant
  const { data, error } = await supabaseAdmin
    .from('client_no_show_stats')
    .select('client_email, no_show_count, last_no_show_at')
    .eq('restaurant_id', auth.restaurantId)
    .gt('no_show_count', 0)
    .order('no_show_count', { ascending: false });

  if (error) return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });

  return NextResponse.json({ stats: data ?? [] });
}
