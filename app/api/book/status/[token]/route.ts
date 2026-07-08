import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { estimateDelay } from '@/lib/delay-estimate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = rateLimit({ prefix: 'book-status', limit: 30, windowMs: 60_000 });

/**
 * GET /api/book/status/[token] — suivi temps réel d'un RDV (bêta).
 * Public via cancel_token (même capability que la page d'annulation).
 * Retard estimé calculé le jour J depuis les RDV du praticien (completed_at).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 });
  }

  const { data: apt } = await supabaseAdmin
    .from('appointments')
    .select('id, restaurant_id, staff_id, date, start_time, end_time, status, service:services(name), staff:staff_members(name)')
    .eq('cancel_token', token)
    .maybeSingle();
  if (!apt) return NextResponse.json({ error: 'Rendez-vous introuvable.' }, { status: 404 });

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('name, slug, primary_color')
    .eq('id', apt.restaurant_id)
    .single();

  // Retard estimé : uniquement le jour J, pour un RDV encore confirmé.
  const today = new Date().toISOString().slice(0, 10);
  let delay: { delayMinutes: number; basis: string } | null = null;
  if (apt.date === today && apt.status === 'confirmed' && apt.staff_id) {
    // select('*') : tolère l'absence de completed_at tant que la migration 044
    // n'est pas appliquée (le signal tombe alors sur le seul bouchon).
    const { data: dayAppts } = await supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('restaurant_id', apt.restaurant_id)
      .eq('staff_id', apt.staff_id)
      .eq('date', today)
      .lt('start_time', apt.start_time)
      .in('status', ['confirmed', 'completed']);
    delay = estimateDelay((dayAppts ?? []) as Parameters<typeof estimateDelay>[0], new Date());
  }

  return NextResponse.json({
    appointment: {
      date: apt.date,
      startTime: String(apt.start_time).slice(0, 5),
      endTime: String(apt.end_time).slice(0, 5),
      status: apt.status,
      service: (apt.service as unknown as { name: string } | null)?.name ?? null,
      staff: (apt.staff as unknown as { name: string } | null)?.name ?? null,
    },
    business: restaurant ? { name: restaurant.name, slug: restaurant.slug, primaryColor: restaurant.primary_color } : null,
    delay,
    isToday: apt.date === today,
  });
}
