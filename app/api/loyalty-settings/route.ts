import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

/* ── GET /api/loyalty-settings ───────────────────────────────────────────── */

export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { data: settings, error } = await supabaseAdmin
    .from('loyalty_settings')
    .select('points_per_scan, reward_threshold, reward_message, stamps_total, program_type')
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();

  if (error) {
    console.error('[loyalty-settings GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: settings ?? null });
}
