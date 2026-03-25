import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── GET /api/admin/wallet/templates ─────────────────────────────────────── */

export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get('restaurantId');

  let query = supabaseAdmin
    .from('wallet_pass_templates')
    .select('id, name, pass_kind, status, primary_color, config_json, is_repeatable, is_default, valid_from, valid_to, created_at, restaurant_id, restaurants(id, name, slug)')
    .order('created_at', { ascending: false });

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data: templates, error } = await query;

  if (error) {
    console.error('[admin/wallet/templates GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Count active passes per template
  const ids = (templates ?? []).map((t) => t.id);
  const passCountMap: Record<string, number> = {};

  if (ids.length > 0) {
    const { data: counts } = await supabaseAdmin
      .from('wallet_passes')
      .select('template_id')
      .in('template_id', ids)
      .eq('status', 'active');

    (counts ?? []).forEach((r) => {
      passCountMap[r.template_id] = (passCountMap[r.template_id] ?? 0) + 1;
    });
  }

  return NextResponse.json({
    templates: (templates ?? []).map((t) => ({
      ...t,
      active_passes: passCountMap[t.id] ?? 0,
    })),
  });
}

/* ── POST /api/admin/wallet/templates ────────────────────────────────────── */

interface CreateBody {
  restaurant_id:  string;
  name:           string;
  pass_kind:      'stamps' | 'points' | 'event';
  status?:        'published' | 'draft' | 'archived';
  primary_color?: string;
  is_repeatable?: boolean;
  is_default?:    boolean;
  valid_from?:    string | null;
  valid_to?:      string | null;
  config_json?:   Record<string, unknown>;
}

export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  let body: Partial<CreateBody>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 });
  }

  const {
    restaurant_id, name, pass_kind, status = 'published',
    primary_color, is_repeatable, is_default, valid_from, valid_to, config_json,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Le nom du template est requis.' }, { status: 400 });
  }
  if (!pass_kind || !['stamps', 'points', 'event'].includes(pass_kind)) {
    return NextResponse.json({ error: 'pass_kind doit être "stamps", "points" ou "event".' }, { status: 400 });
  }

  // Verify restaurant exists (if provided — drafts have no restaurant)
  if (restaurant_id) {
    const { data: restaurant } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('id', restaurant_id)
      .maybeSingle();

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
    }
  }

  // Clear is_default on existing templates for this restaurant
  if (is_default === true && restaurant_id) {
    await supabaseAdmin
      .from('wallet_pass_templates')
      .update({ is_default: false })
      .eq('restaurant_id', restaurant_id);
  }

  const { data: template, error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .insert({
      restaurant_id: restaurant_id || null,
      name:          name.trim(),
      pass_kind,
      status,
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
    console.error('[admin/wallet/templates POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template }, { status: 201 });
}
