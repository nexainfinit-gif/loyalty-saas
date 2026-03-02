import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

/* ── PATCH /api/wallet/templates/:id ─────────────────────────────────────── */

interface TemplatePatchBody {
  is_default?:    boolean;
  name?:          string;
  primary_color?: string;
  config_json?:   Record<string, unknown>;
  status?:        'published' | 'draft' | 'archived';
  valid_from?:    string | null;
  valid_to?:      string | null;
  is_repeatable?: boolean;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { id: templateId } = await params;

  let body: TemplatePatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 });
  }

  // Verify the template belongs to this restaurant
  const { data: existing } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id')
    .eq('id', templateId)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Template introuvable.' }, { status: 404 });
  }

  // Archive guard: cannot archive if active passes exist
  if (body.status === 'archived') {
    const { count } = await supabaseAdmin
      .from('wallet_passes')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', templateId)
      .eq('status', 'active');

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Ce template a ${count} passe${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''}. Révoquez-les avant d'archiver.` },
        { status: 400 },
      );
    }
  }

  // If setting as default, clear the flag on all other templates for this restaurant first
  if (body.is_default === true) {
    await supabaseAdmin
      .from('wallet_pass_templates')
      .update({ is_default: false })
      .eq('restaurant_id', guard.restaurantId);
  }

  // Build update payload — only include provided fields
  const updatePayload: Record<string, unknown> = {};
  if (body.is_default !== undefined) updatePayload.is_default    = body.is_default;
  if (body.name       !== undefined) updatePayload.name          = body.name.trim();
  if (body.primary_color !== undefined) updatePayload.primary_color = body.primary_color;
  if (body.config_json   !== undefined) updatePayload.config_json   = body.config_json;
  if (body.status        !== undefined) updatePayload.status        = body.status;
  if (body.valid_from    !== undefined) updatePayload.valid_from    = body.valid_from;
  if (body.valid_to      !== undefined) updatePayload.valid_to      = body.valid_to;
  if (body.is_repeatable !== undefined) updatePayload.is_repeatable = body.is_repeatable;

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 });
  }

  const { data: template, error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .update(updatePayload)
    .eq('id', templateId)
    .select()
    .single();

  if (error) {
    console.error('[wallet/templates PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template });
}
