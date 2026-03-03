import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/plans/[planId]/features
 * Replace all feature toggles for a plan (full replace, not merge).
 * Auth: platform owner only.
 *
 * Body: Record<string, boolean>  e.g. { wallet_studio: true, analytics: false }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { planId } = await params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Corps de requête invalide. Attendu: Record<string,boolean>.' }, { status: 400 });
  }

  // Verify plan exists
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('id', planId)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: 'Plan introuvable.' }, { status: 404 });
  }

  // Delete all existing features for this plan
  await supabaseAdmin.from('plan_features').delete().eq('plan_id', planId);

  // Insert new feature set
  const featureRows = Object.entries(body)
    .filter(([key]) => typeof key === 'string' && key.trim().length > 0)
    .map(([feature_key, enabled]) => ({
      plan_id:     planId,
      feature_key: feature_key.trim(),
      enabled:     Boolean(enabled),
    }));

  if (featureRows.length > 0) {
    const { error } = await supabaseAdmin.from('plan_features').insert(featureRows);
    if (error) {
      return NextResponse.json({ error: 'Erreur enregistrement features.' }, { status: 500 });
    }
  }

  const features = Object.fromEntries(featureRows.map((f) => [f.feature_key, f.enabled]));
  return NextResponse.json({ features });
}
