import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { eventSlug, validateEventPriceCents } from '@/lib/events';
import { pushPassUpdate } from '@/lib/apns';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title:        z.string().trim().min(2, 'Titre trop court.').max(120),
  description:  z.string().trim().max(2000).optional().nullable(),
  location:     z.string().trim().max(200).optional().nullable(),
  starts_at:    z.string().datetime({ offset: true }),
  ends_at:      z.string().datetime({ offset: true }).optional().nullable(),
  capacity:     z.number().int().min(1).max(100000).optional().nullable(),
  price:        z.number().min(0),
  status:       z.enum(['draft', 'published']).optional(),
  offer_loyalty: z.boolean().optional(),
  theme:        z.enum(['nuit', 'corporate', 'musee', 'minimal']).optional(),
});

const updateSchema = createSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(['draft', 'published', 'cancelled', 'ended']).optional(),
});

/** GET /api/events — liste des événements de l'établissement (+ compteur billets). */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('id, title, slug, description, location, starts_at, ends_at, capacity, price, status, offer_loyalty, theme, created_at')
    .eq('restaurant_id', guard.restaurantId)
    .order('starts_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });

  // Compteur de billets valides par événement (une requête, agrégé côté code)
  const ids = (events ?? []).map(e => e.id);
  const counts: Record<string, { valid: number; checked_in: number }> = {};
  if (ids.length) {
    const { data: tickets } = await supabaseAdmin
      .from('event_tickets')
      .select('event_id, status')
      .eq('restaurant_id', guard.restaurantId)
      .in('event_id', ids)
      .in('status', ['valid', 'checked_in']);
    for (const t of tickets ?? []) {
      counts[t.event_id] ??= { valid: 0, checked_in: 0 };
      if (t.status === 'checked_in') counts[t.event_id].checked_in++;
      else counts[t.event_id].valid++;
    }
  }

  const { data: resto } = await supabaseAdmin
    .from('restaurants')
    .select('slug, products')
    .eq('id', guard.restaurantId)
    .single();

  return NextResponse.json({
    businessSlug: resto?.slug ?? null,
    hasLoyalty: (resto?.products ?? ['loyalty']).includes('loyalty'),
    events: (events ?? []).map(e => ({
      ...e,
      tickets_valid: (counts[e.id]?.valid ?? 0) + (counts[e.id]?.checked_in ?? 0),
      tickets_checked_in: counts[e.id]?.checked_in ?? 0,
    })),
  });
}

/** POST /api/events — création d'un événement. */
export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

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

  // Slug unique par établissement — suffixe numérique en cas de collision.
  const base = eventSlug(d.title) || 'evenement';
  let slug = base;
  for (let i = 2; i < 20; i++) {
    const { data: clash } = await supabaseAdmin
      .from('events').select('id')
      .eq('restaurant_id', guard.restaurantId).eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${i}`;
  }

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert({
      restaurant_id: guard.restaurantId,
      title: d.title,
      slug,
      description: d.description ?? null,
      location: d.location ?? null,
      starts_at: d.starts_at,
      ends_at: d.ends_at ?? null,
      capacity: d.capacity ?? null,
      price: d.price,
      status: d.status ?? 'draft',
      offer_loyalty: d.offer_loyalty ?? false,
      theme: d.theme ?? 'nuit',
    })
    .select()
    .single();
  if (error) {
    logger.error({ ctx: 'events-create', rid: guard.restaurantId, msg: 'insert failed', err: error.message });
    return NextResponse.json({ error: 'Erreur lors de la création.' }, { status: 500 });
  }
  return NextResponse.json({ event });
}

/** PATCH /api/events — mise à jour d'un événement. */
export async function PATCH(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(i => i.message).join(', ') }, { status: 400 });
  }
  const { id, ...fields } = parsed.data;
  if (fields.price !== undefined && validateEventPriceCents(fields.price) === null) {
    return NextResponse.json({ error: 'Prix invalide (0 à 500 €).' }, { status: 400 });
  }

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', guard.restaurantId)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 });
  if (!event) return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });

  // Événement annulé → tous les pass Wallet des billets basculent en ANNULÉ
  // (voided + badge + notif lockscreen). Fire-and-forget : la réponse au
  // dashboard ne dépend pas d'APNS.
  if (fields.status === 'cancelled') {
    notifyEventPasses(id, guard.restaurantId).catch(err =>
      logger.warn({ ctx: 'events-update', rid: guard.restaurantId, msg: 'cancel push failed', err: String(err) }),
    );
  }
  return NextResponse.json({ event });
}

/** Push APNS vers tous les pass Wallet des billets d'un événement. */
async function notifyEventPasses(eventId: string, restaurantId: string) {
  const { data: tickets } = await supabaseAdmin
    .from('event_tickets')
    .select('id')
    .eq('event_id', eventId)
    .eq('restaurant_id', restaurantId)
    .in('status', ['valid', 'checked_in']);
  if (!tickets?.length) return;

  const { data: passes } = await supabaseAdmin
    .from('wallet_passes')
    .select('id')
    .in('event_ticket_id', tickets.map(t => t.id))
    .eq('status', 'active');
  for (const p of passes ?? []) {
    await pushPassUpdate(p.id);
  }
}

/** DELETE /api/events?id=… — suppression (interdite si des billets valides existent). */
export async function DELETE(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  }

  const { count } = await supabaseAdmin
    .from('event_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('restaurant_id', guard.restaurantId)
    .in('status', ['valid', 'checked_in']);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Des billets ont été vendus — annulez l\'événement plutôt que de le supprimer.' },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin
    .from('events')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', guard.restaurantId);
  if (error) return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
