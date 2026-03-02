import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/plans
 * Returns all plans with their feature rows.
 * Auth: platform owner only.
 */
export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { data: plans, error } = await supabaseAdmin
    .from('plans')
    .select('id, key, name, price_monthly, is_public, is_active, sort_order, created_at')
    .order('sort_order', { ascending: true });

  if (error || !plans) {
    return NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 });
  }

  // Fetch all features for all plans in one query
  const { data: allFeatures } = await supabaseAdmin
    .from('plan_features')
    .select('plan_id, feature_key, enabled');

  const featuresByPlan = new Map<string, Record<string, boolean>>();
  for (const f of allFeatures ?? []) {
    if (!featuresByPlan.has(f.plan_id)) featuresByPlan.set(f.plan_id, {});
    featuresByPlan.get(f.plan_id)![f.feature_key] = f.enabled;
  }

  const rows = plans.map((p) => ({
    ...p,
    features: featuresByPlan.get(p.id) ?? {},
  }));

  return NextResponse.json({ plans: rows });
}

/**
 * POST /api/admin/plans
 * Create a new plan with optional initial features.
 * Auth: platform owner only.
 *
 * Body: { key, name, price_monthly?, is_public?, sort_order?, features?: Record<string,boolean> }
 */
export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  if (!body || !body.key || !body.name) {
    return NextResponse.json({ error: 'key et name sont requis.' }, { status: 400 });
  }

  const { key, name, price_monthly, is_public, sort_order, features } = body;

  const { data: plan, error } = await supabaseAdmin
    .from('plans')
    .insert({
      key:           String(key).trim().toLowerCase(),
      name:          String(name).trim(),
      price_monthly: price_monthly != null ? Number(price_monthly) : null,
      is_public:     is_public !== false,
      sort_order:    sort_order != null ? Number(sort_order) : 0,
    })
    .select()
    .single();

  if (error || !plan) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Ce key de plan existe déjà.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erreur création plan.' }, { status: 500 });
  }

  // Insert initial features if provided
  if (features && typeof features === 'object') {
    const featureRows = Object.entries(features).map(([feature_key, enabled]) => ({
      plan_id:     plan.id,
      feature_key,
      enabled:     Boolean(enabled),
    }));
    if (featureRows.length > 0) {
      await supabaseAdmin.from('plan_features').insert(featureRows);
    }
  }

  return NextResponse.json({ plan }, { status: 201 });
}
