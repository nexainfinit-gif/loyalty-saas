import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

/* ── GET /api/wallet/passes?customerId=UUID&status=active ─────────────────── */
/*
 * Returns all wallet passes for a customer, joined with template metadata.
 * Auth: Bearer token (restaurant owner).
 * Query params:
 *   customerId  – required, UUID
 *   status      – optional filter: 'active' | 'revoked' | 'expired' | 'all' (default: 'all')
 *   platform    – optional filter: 'apple' | 'google'
 */

export async function GET(request: Request) {
  // ── Auth: platform owner only ─────────────────────────────────────────────
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  // ── Query params ───────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId') ?? '';
  const status     = searchParams.get('status')     ?? 'all';
  const platform   = searchParams.get('platform')   ?? '';

  if (!customerId) {
    return NextResponse.json({ error: 'customerId est requis.' }, { status: 400 });
  }

  // ── Validate customer belongs to this restaurant ───────────────────────────
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, email')
    .eq('id', customerId)
    .eq('restaurant_id', guard.restaurantId)
    .single();

  if (!customer) {
    return NextResponse.json({ error: 'Client introuvable ou accès refusé.' }, { status: 404 });
  }

  // ── Build query ────────────────────────────────────────────────────────────
  let query = supabaseAdmin
    .from('wallet_passes')
    .select(`
      id,
      platform,
      status,
      pass_seq,
      serial_number,
      object_id,
      issued_at,
      expires_at,
      revoked_at,
      template:wallet_pass_templates (
        id,
        name,
        pass_kind,
        status,
        is_default,
        is_repeatable,
        valid_from,
        valid_to
      )
    `)
    .eq('restaurant_id', guard.restaurantId)
    .eq('customer_id',   customerId)
    .order('issued_at', { ascending: false });

  if (status !== 'all' && ['active', 'revoked', 'expired'].includes(status)) {
    query = query.eq('status', status);
  }
  if (platform && ['apple', 'google'].includes(platform)) {
    query = query.eq('platform', platform);
  }

  const { data: passes, error: queryErr } = await query;

  if (queryErr) {
    console.error('[wallet/passes]', queryErr);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  return NextResponse.json({
    customer,
    passes: passes ?? [],
    total:  passes?.length ?? 0,
  });
}
