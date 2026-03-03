import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── PATCH /api/admin/wallet/templates/[id] ──────────────────────────────── */

interface PatchBody {
  name?:          string;
  pass_kind?:     'stamps' | 'points' | 'event';
  status?:        'published' | 'draft' | 'archived';
  primary_color?: string | null;
  is_repeatable?: boolean;
  is_default?:    boolean;
  valid_from?:    string | null;
  valid_to?:      string | null;
  config_json?:   Record<string, unknown>;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;

  let body: Partial<PatchBody>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 });
  }

  // Fetch existing template to get restaurant_id for is_default cascade
  const { data: existing } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id, restaurant_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Template introuvable.' }, { status: 404 });
  }

  // If setting as default, clear the flag on all others for this restaurant
  if (body.is_default === true) {
    await supabaseAdmin
      .from('wallet_pass_templates')
      .update({ is_default: false })
      .eq('restaurant_id', existing.restaurant_id);
  }

  const patch: Record<string, unknown> = {};
  if (body.name       !== undefined) patch.name          = body.name?.trim();
  if (body.pass_kind  !== undefined) patch.pass_kind     = body.pass_kind;
  if (body.status     !== undefined) patch.status        = body.status;
  if ('primary_color' in body)       patch.primary_color = body.primary_color ?? null;
  if (body.is_repeatable !== undefined) patch.is_repeatable = body.is_repeatable;
  if (body.is_default    !== undefined) patch.is_default    = body.is_default;
  if ('valid_from' in body)          patch.valid_from    = body.valid_from ?? null;
  if ('valid_to'   in body)          patch.valid_to      = body.valid_to   ?? null;
  if (body.config_json !== undefined) patch.config_json  = body.config_json;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 });
  }

  const { data: template, error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[admin/wallet/templates PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template });
}

/* ── DELETE /api/admin/wallet/templates/[id] ─────────────────────────────── */

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;

  // Check for active passes linked to this template
  const { count } = await supabaseAdmin
    .from('wallet_passes')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', id)
    .eq('status', 'active');

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Impossible de supprimer : ${count} pass actif(s) liés à ce template.` },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[admin/wallet/templates DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
