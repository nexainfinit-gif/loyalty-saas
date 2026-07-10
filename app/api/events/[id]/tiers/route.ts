import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validateEventPriceCents } from '@/lib/events';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name:           z.string().trim().min(1, 'Nom requis.').max(60),
  description:    z.string().trim().max(300).optional().nullable(),
  price:          z.number().min(0),
  capacity:       z.number().int().min(1).max(100000).optional().nullable(),
  kind:           z.enum(['standard', 'vip_table']).optional(),
  seats_per_unit: z.number().int().min(1).max(20).optional(),
});

const updateSchema = createSchema.partial().extend({
  tierId:    z.string().uuid(),
  is_active: z.boolean().optional(),
});

/** Vérifie que l'événement appartient à l'établissement (isolation). */
async function ownEvent(eventId: string, restaurantId: string) {
  const { data } = await supabaseAdmin
    .from('events').select('id')
    .eq('id', eventId).eq('restaurant_id', restaurantId).maybeSingle();
  return !!data;
}

/** GET /api/events/[id]/tiers — catégories de billets de l'événement. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { id } = await params;
  if (!(await ownEvent(id, guard.restaurantId))) {
    return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });
  }

  const { data: tiers, error } = await supabaseAdmin
    .from('event_ticket_tiers')
    .select('id, name, description, price, capacity, kind, seats_per_unit, sort_order, is_active')
    .eq('event_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });

  // Unités vendues par catégorie
  const sold: Record<string, number> = {};
  const ids = (tiers ?? []).map(t => t.id);
  if (ids.length) {
    const { data: tk } = await supabaseAdmin
      .from('event_tickets')
      .select('tier_id')
      .in('tier_id', ids)
      .in('status', ['valid', 'checked_in']);
    for (const t of tk ?? []) { if (t.tier_id) sold[t.tier_id] = (sold[t.tier_id] ?? 0) + 1; }
  }

  return NextResponse.json({
    tiers: (tiers ?? []).map(t => ({ ...t, price: Number(t.price), sold: sold[t.id] ?? 0 })),
  });
}

/** POST /api/events/[id]/tiers — création d'une catégorie. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { id } = await params;
  if (!(await ownEvent(id, guard.restaurantId))) {
    return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(i => i.message).join(', ') }, { status: 400 });
  }
  const d = parsed.data;
  if (validateEventPriceCents(d.price) === null) {
    return NextResponse.json({ error: 'Prix invalide (0 à 500 €).' }, { status: 400 });
  }

  const { count } = await supabaseAdmin
    .from('event_ticket_tiers')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id);
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Maximum 10 catégories par événement.' }, { status: 409 });
  }

  const { data: tier, error } = await supabaseAdmin
    .from('event_ticket_tiers')
    .insert({
      event_id: id,
      restaurant_id: guard.restaurantId,
      name: d.name,
      description: d.description ?? null,
      price: d.price,
      capacity: d.capacity ?? null,
      kind: d.kind ?? 'standard',
      seats_per_unit: d.kind === 'vip_table' ? (d.seats_per_unit ?? 4) : 1,
      sort_order: count ?? 0,
    })
    .select()
    .single();
  if (error) {
    logger.error({ ctx: 'tiers-create', rid: guard.restaurantId, msg: 'insert failed', err: error.message });
    return NextResponse.json({ error: 'Erreur lors de la création.' }, { status: 500 });
  }
  return NextResponse.json({ tier });
}

/** PATCH /api/events/[id]/tiers — mise à jour (dont activation/désactivation). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(i => i.message).join(', ') }, { status: 400 });
  }
  const { tierId, ...fields } = parsed.data;
  if (fields.price !== undefined && validateEventPriceCents(fields.price) === null) {
    return NextResponse.json({ error: 'Prix invalide (0 à 500 €).' }, { status: 400 });
  }

  const { data: tier, error } = await supabaseAdmin
    .from('event_ticket_tiers')
    .update(fields)
    .eq('id', tierId)
    .eq('event_id', id)
    .eq('restaurant_id', guard.restaurantId)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 });
  if (!tier) return NextResponse.json({ error: 'Catégorie introuvable.' }, { status: 404 });
  return NextResponse.json({ tier });
}

/** DELETE /api/events/[id]/tiers?tierId=… — suppression (si aucun billet vendu). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { id } = await params;
  const tierId = new URL(request.url).searchParams.get('tierId');
  if (!tierId || !/^[0-9a-f-]{36}$/i.test(tierId)) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  }

  const { count } = await supabaseAdmin
    .from('event_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('tier_id', tierId)
    .in('status', ['valid', 'checked_in']);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Des billets ont été vendus dans cette catégorie — désactivez-la plutôt.' },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin
    .from('event_ticket_tiers')
    .delete()
    .eq('id', tierId)
    .eq('event_id', id)
    .eq('restaurant_id', guard.restaurantId);
  if (error) return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
