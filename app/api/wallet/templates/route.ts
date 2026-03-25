import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';
import { checkPlanLimit, planLimitError } from '@/lib/plan-limits';

/* ── Types ────────────────────────────────────────────────────────────────── */

type PassKind = 'stamps' | 'points' | 'event';

interface CreateBody {
  name:          string;
  type:          PassKind;       // UI name; stored as pass_kind
  primary_color?: string;
  is_repeatable?: boolean;
  is_default?:    boolean;
  valid_from?:    string | null;
  valid_to?:      string | null;
  config_json?:   Record<string, unknown>;
}

/* ── GET /api/wallet/templates?restaurantId= ─────────────────────────────── */

export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  // Optional restaurantId param — owner may only query their own restaurant
  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get('restaurantId') ?? guard.restaurantId;

  if (restaurantId !== guard.restaurantId) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  // 1. Templates owned by this restaurant
  const { data: ownTemplates, error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id, name, pass_kind, status, primary_color, config_json, is_repeatable, is_default, valid_from, valid_to, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[wallet/templates GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Also find draft templates (restaurant_id IS NULL) that have active passes for this restaurant
  const { data: draftPasses } = await supabaseAdmin
    .from('wallet_passes')
    .select('template_id')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active');

  const draftTemplateIds = [...new Set((draftPasses ?? []).map(p => p.template_id))]
    .filter(id => !(ownTemplates ?? []).some(t => t.id === id));

  let draftTemplates: typeof ownTemplates = [];
  if (draftTemplateIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('wallet_pass_templates')
      .select('id, name, pass_kind, status, primary_color, config_json, is_repeatable, is_default, valid_from, valid_to, created_at')
      .in('id', draftTemplateIds)
      .is('restaurant_id', null);
    draftTemplates = data ?? [];
  }

  const allTemplates = [...(ownTemplates ?? []), ...draftTemplates];

  // Count active passes per template
  const ids = allTemplates.map(t => t.id);
  const passCountMap: Record<string, number> = {};

  if (ids.length > 0) {
    const { data: counts } = await supabaseAdmin
      .from('wallet_passes')
      .select('template_id')
      .in('template_id', ids)
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active');

    (counts ?? []).forEach(r => {
      passCountMap[r.template_id] = (passCountMap[r.template_id] ?? 0) + 1;
    });
  }

  return NextResponse.json({
    templates: allTemplates.map(t => ({
      ...t,
      active_passes: passCountMap[t.id] ?? 0,
    })),
  });
}

/* ── POST /api/wallet/templates ───────────────────────────────────────────── */

export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  // ── Plan limit: maxTemplates ──
  const { allowed, limit, current } = await checkPlanLimit(guard.restaurantId, guard.plan, 'templates');
  if (!allowed) {
    return NextResponse.json(planLimitError('templates', current, limit), { status: 403 });
  }

  let body: Partial<CreateBody>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 });
  }

  const { name, type, primary_color, is_repeatable, is_default, valid_from, valid_to, config_json } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Le nom du template est requis.' }, { status: 400 });
  }
  if (!type || !['stamps', 'points', 'event'].includes(type)) {
    return NextResponse.json({ error: 'type doit être "stamps", "points" ou "event".' }, { status: 400 });
  }

  // If setting this template as default, clear the flag on all others first
  if (is_default === true) {
    await supabaseAdmin
      .from('wallet_pass_templates')
      .update({ is_default: false })
      .eq('restaurant_id', guard.restaurantId);
  }

  const { data: template, error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .insert({
      restaurant_id: guard.restaurantId,
      name:          name.trim(),
      pass_kind:     type,
      status:        'published',        // immediately usable for pass issuance
      config_json:   config_json ?? {},
      primary_color: primary_color ?? null,
      is_default:    is_default === true,
      is_repeatable: is_repeatable ?? false,
      valid_from:    valid_from ?? null,
      valid_to:      valid_to ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[wallet/templates POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template }, { status: 201 });
}
