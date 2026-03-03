import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/kpis/[kpiId]
 * Update KPI metadata (name, description, category, is_active).
 * Auth: platform owner only.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ kpiId: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { kpiId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  const allowed = ['name', 'description', 'category', 'is_active'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 });
  }

  const { data: kpi, error } = await supabaseAdmin
    .from('kpis')
    .update(patch)
    .eq('id', kpiId)
    .select()
    .maybeSingle();

  if (error || !kpi) {
    return NextResponse.json({ error: 'Erreur mise à jour KPI.' }, { status: 500 });
  }

  return NextResponse.json({ kpi });
}
