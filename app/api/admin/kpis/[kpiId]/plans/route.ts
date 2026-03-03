import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/kpis/[kpiId]/plans
 * Replace plan access for a KPI (full replace, not merge).
 * Auth: platform owner only.
 *
 * Body: Record<plan_id, boolean>  — map of plan UUIDs to enabled state.
 *
 * Example: { "uuid-free": false, "uuid-pro": true }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ kpiId: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { kpiId } = await params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Corps invalide. Attendu: Record<plan_id, boolean>.' }, { status: 400 });
  }

  // Verify KPI exists
  const { data: kpi } = await supabaseAdmin
    .from('kpis')
    .select('id')
    .eq('id', kpiId)
    .maybeSingle();

  if (!kpi) {
    return NextResponse.json({ error: 'KPI introuvable.' }, { status: 404 });
  }

  // Delete existing plan_kpis for this KPI
  await supabaseAdmin.from('plan_kpis').delete().eq('kpi_id', kpiId);

  // Insert new assignments
  const rows = Object.entries(body)
    .filter(([planId]) => typeof planId === 'string' && planId.trim().length > 0)
    .map(([planId, enabled]) => ({
      kpi_id:  kpiId,
      plan_id: planId.trim(),
      enabled: Boolean(enabled),
    }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('plan_kpis').insert(rows);
    if (error) {
      return NextResponse.json({ error: 'Erreur enregistrement accès plans.' }, { status: 500 });
    }
  }

  const plan_access = Object.fromEntries(rows.map((r) => [r.plan_id, r.enabled]));
  return NextResponse.json({ plan_access });
}
