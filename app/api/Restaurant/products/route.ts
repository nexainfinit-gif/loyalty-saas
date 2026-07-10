import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  add: z.enum(['loyalty', 'booking', 'ticketing']),
});

/**
 * PATCH /api/restaurant/products — active un service supplémentaire (T0.5).
 * L'activation est DYNAMIQUE depuis les Paramètres (pas à l'inscription) :
 *  - ticketing : gratuit (commission par billet) → activation immédiate ;
 *  - loyalty / booking : nécessitent un plan payant → si le compte est sur
 *    le plan gratuit, `needsPlan: true` (le client bascule vers choose-plan
 *    et l'abonnement redevient exigé).
 * Pas de désactivation ici : retirer un service qui porte des données
 * (clients, rendez-vous) est un sujet à part.
 */
export async function PATCH(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Service invalide.' }, { status: 400 });
  const { add } = parsed.data;

  const { data: resto } = await supabaseAdmin
    .from('restaurants')
    .select('id, products, subscription_status, plans(key)')
    .eq('id', guard.restaurantId)
    .single();
  if (!resto) return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });

  const products: string[] = resto.products ?? ['loyalty'];
  if (products.includes(add)) {
    return NextResponse.json({ ok: true, products, needsPlan: false });
  }

  const next = [...products, add];
  const plansRel = resto.plans as unknown as { key: string } | { key: string }[] | null;
  const planKey = (Array.isArray(plansRel) ? plansRel[0]?.key : plansRel?.key) ?? 'free';
  // Fidélité/réservations sur un compte gratuit (ex. Rebites Events pur) :
  // il faut choisir un plan — on ré-exige l'abonnement.
  const needsPlan = add !== 'ticketing' && planKey === 'free';

  const { error } = await supabaseAdmin
    .from('restaurants')
    .update({
      products: next,
      ...(needsPlan ? { subscription_status: 'inactive' } : {}),
    })
    .eq('id', guard.restaurantId);
  if (error) {
    logger.error({ ctx: 'products-add', rid: guard.restaurantId, msg: 'update failed', err: error.message });
    return NextResponse.json({ error: 'Erreur lors de l\'activation.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, products: next, needsPlan });
}
