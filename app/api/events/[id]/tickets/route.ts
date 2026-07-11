import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/events/[id]/tickets — participants d'un événement (owner). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { id } = await params;

  // Vérifie l'appartenance de l'événement (isolation multi-tenant)
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, title')
    .eq('id', id)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });

  // refunded reste visible : l'organisateur doit voir ce qu'il a remboursé.
  const { data: tickets, error } = await supabaseAdmin
    .from('event_tickets')
    .select('id, code, buyer_name, buyer_email, amount, status, created_at, paid_at, checked_in_at')
    .eq('event_id', id)
    .eq('restaurant_id', guard.restaurantId)
    .in('status', ['valid', 'checked_in', 'refunded'])
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });

  return NextResponse.json({ event: { id: event.id, title: event.title }, tickets: tickets ?? [] });
}
