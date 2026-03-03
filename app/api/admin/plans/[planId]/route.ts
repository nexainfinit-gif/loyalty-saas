import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/plans/[planId]
 * Returns a single plan with all its feature rows.
 * Auth: platform owner only.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { planId } = await params;

  const { data: plan, error } = await supabaseAdmin
    .from('plans')
    .select('id, key, name, price_monthly, is_public, is_active, sort_order, created_at')
    .eq('id', planId)
    .maybeSingle();

  if (error || !plan) {
    return NextResponse.json({ error: 'Plan introuvable.' }, { status: 404 });
  }

  const { data: featureRows } = await supabaseAdmin
    .from('plan_features')
    .select('feature_key, enabled')
    .eq('plan_id', planId);

  const features = Object.fromEntries(
    (featureRows ?? []).map((f) => [f.feature_key, f.enabled])
  );

  // Count restaurants using this plan
  const { count: restaurantCount } = await supabaseAdmin
    .from('restaurants')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId);

  return NextResponse.json({ plan: { ...plan, features }, restaurant_count: restaurantCount ?? 0 });
}

/**
 * PATCH /api/admin/plans/[planId]
 * Update plan metadata (not features — use /features for that).
 * Auth: platform owner only.
 *
 * Body: { name?, price_monthly?, is_public?, is_active?, sort_order? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { planId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  const allowed = ['name', 'price_monthly', 'is_public', 'is_active', 'sort_order'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 });
  }

  const { data: plan, error } = await supabaseAdmin
    .from('plans')
    .update(patch)
    .eq('id', planId)
    .select()
    .maybeSingle();

  if (error || !plan) {
    return NextResponse.json({ error: 'Erreur mise à jour plan.' }, { status: 500 });
  }

  return NextResponse.json({ plan });
}
