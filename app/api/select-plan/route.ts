import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/select-plan
 * Allows an authenticated restaurant owner to select a plan.
 * Body: { plan_id: string }
 */
export async function POST(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.plan_id || typeof body.plan_id !== 'string') {
    return NextResponse.json({ error: 'plan_id requis.' }, { status: 400 });
  }

  // Verify plan exists and is public + active
  const { data: plan, error: planError } = await supabaseAdmin
    .from('plans')
    .select('id, key, stripe_price_id')
    .eq('id', body.plan_id)
    .eq('is_public', true)
    .eq('is_active', true)
    .maybeSingle();

  if (planError || !plan) {
    return NextResponse.json({ error: 'Plan invalide.' }, { status: 400 });
  }

  // Paid plans must go through Stripe checkout
  if (plan.stripe_price_id) {
    return NextResponse.json(
      { error: 'Ce plan nécessite un abonnement Stripe. Utilisez /api/stripe/checkout.' },
      { status: 400 },
    );
  }

  // Update restaurant (free plan only)
  const { error } = await supabaseAdmin
    .from('restaurants')
    .update({ plan_id: plan.id, plan: plan.key })
    .eq('id', guard.restaurantId);

  if (error) {
    return NextResponse.json({ error: 'Erreur mise à jour du plan.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, plan_key: plan.key });
}
