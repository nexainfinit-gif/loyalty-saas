import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';
import { validatePackagePriceCents, validateSessions } from '@/lib/packages';

/**
 * GET    /api/packages         — offres du commerçant (catalogue).
 * POST   /api/packages         — crée une offre { name, sessions, price }.
 * DELETE /api/packages?id=...  — désactive une offre (soft delete).
 * Toutes scopées au restaurant du commerçant.
 */
export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { data } = await supabaseAdmin
    .from('packages')
    .select('id, name, sessions_count, price, active, created_at')
    .eq('restaurant_id', guard.restaurantId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ packages: data ?? [] });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sessions: z.number(),
  price: z.number(),
});

export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Champs invalides.' }, { status: 400 });

  const sessions = validateSessions(parsed.data.sessions);
  const priceCents = validatePackagePriceCents(parsed.data.price);
  if (sessions === null) return NextResponse.json({ error: 'Nombre de séances invalide (1 à 100).' }, { status: 400 });
  if (priceCents === null) return NextResponse.json({ error: 'Prix invalide (1 € à 5000 €).' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('packages')
    .insert({
      restaurant_id: guard.restaurantId,
      name: parsed.data.name,
      sessions_count: sessions,
      price: priceCents / 100,
    })
    .select('id, name, sessions_count, price, active, created_at')
    .single();

  if (error) return NextResponse.json({ error: 'Erreur lors de la création.' }, { status: 500 });
  return NextResponse.json({ package: data });
}

export async function DELETE(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'ID invalide.' }, { status: 400 });

  // Soft delete : on garde l'historique des forfaits déjà vendus.
  await supabaseAdmin
    .from('packages')
    .update({ active: false })
    .eq('id', id)
    .eq('restaurant_id', guard.restaurantId);

  return NextResponse.json({ success: true });
}
