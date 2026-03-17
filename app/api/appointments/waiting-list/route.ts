import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

/**
 * GET /api/appointments/waiting-list?date=YYYY-MM-DD
 * Returns waiting list entries for the restaurant (dashboard view).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  let query = supabaseAdmin
    .from('waiting_list')
    .select('*, service:services(name), staff:staff_members(name)')
    .eq('restaurant_id', auth.restaurantId)
    .order('created_at', { ascending: true });

  if (date) {
    query = query.eq('desired_date', date);
  } else {
    // Default: show only active entries (waiting/notified)
    query = query.in('status', ['waiting', 'notified']);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}

const cancelSchema = z.object({
  id: z.string().uuid(),
});

/**
 * DELETE /api/appointments/waiting-list
 * Cancel a waiting list entry (owner removes it from dashboard).
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ID invalide.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('waiting_list')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data.id)
    .eq('restaurant_id', auth.restaurantId);

  if (error) {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
