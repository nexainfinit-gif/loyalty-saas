import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/plans
 * Returns public, active plans with their features.
 * No auth required — used during onboarding plan selection.
 */
export async function GET() {
  const { data: plans, error } = await supabaseAdmin
    .from('plans')
    .select('id, key, name, price_monthly, sort_order')
    .eq('is_public', true)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error || !plans) {
    return NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 });
  }

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
