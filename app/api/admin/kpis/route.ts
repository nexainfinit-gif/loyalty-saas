import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/kpis
 * Returns all KPIs with per-plan enabled status.
 * Auth: platform owner only.
 */
export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { data: kpis, error } = await supabaseAdmin
    .from('kpis')
    .select('id, key, name, description, category, is_active, created_at')
    .order('category')
    .order('name');

  if (error) {
    return NextResponse.json({ error: 'Erreur base de données.' }, { status: 500 });
  }

  // Load all plan_kpis in one query to build a map
  const { data: planKpis } = await supabaseAdmin
    .from('plan_kpis')
    .select('plan_id, kpi_id, enabled');

  // planMap[kpi_id][plan_id] = enabled
  const planMap: Record<string, Record<string, boolean>> = {};
  for (const pk of planKpis ?? []) {
    if (!planMap[pk.kpi_id]) planMap[pk.kpi_id] = {};
    planMap[pk.kpi_id][pk.plan_id] = pk.enabled;
  }

  // Fetch all plans for reference
  const { data: plans } = await supabaseAdmin
    .from('plans')
    .select('id, key, name')
    .order('sort_order');

  const rows = (kpis ?? []).map((k) => ({
    ...k,
    plan_access: planMap[k.id] ?? {},
  }));

  return NextResponse.json({ kpis: rows, plans: plans ?? [] });
}

/**
 * POST /api/admin/kpis
 * Create a new KPI in the catalog.
 * Auth: platform owner only.
 *
 * Body: { key, name, description?, category?, is_active? }
 */
export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  if (!body?.key || !body?.name) {
    return NextResponse.json({ error: 'key et name sont requis.' }, { status: 400 });
  }

  const validCategories = ['growth', 'retention', 'revenue', 'engagement'];
  const category = validCategories.includes(body.category) ? body.category : 'growth';

  const { data: kpi, error } = await supabaseAdmin
    .from('kpis')
    .insert({
      key:         String(body.key).trim().toLowerCase().replace(/\s+/g, '_'),
      name:        String(body.name).trim(),
      description: String(body.description ?? '').trim(),
      category,
      is_active:   body.is_active !== false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce key de KPI existe déjà.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erreur création KPI.' }, { status: 500 });
  }

  return NextResponse.json({ kpi }, { status: 201 });
}
