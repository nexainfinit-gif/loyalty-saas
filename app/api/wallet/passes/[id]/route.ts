import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';
import { revokeLoyaltyObject, updateLoyaltyObject } from '@/lib/google-wallet';

/*
 * GET  /api/wallet/passes/:id   — single pass details
 * PATCH /api/wallet/passes/:id  — lifecycle actions: revoke | sync
 */

/* ── GET ──────────────────────────────────────────────────────────────────── */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { id: passId } = await params;

  const { data: pass, error } = await supabaseAdmin
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
      last_synced_at,
      sync_error,
      pass_version,
      customer:customers (
        id,
        first_name,
        last_name,
        email
      ),
      template:wallet_pass_templates (
        id,
        name,
        pass_kind,
        status,
        is_default
      )
    `)
    .eq('id', passId)
    .eq('restaurant_id', guard.restaurantId)
    .single();

  if (error || !pass) {
    return NextResponse.json({ error: 'Pass introuvable ou accès refusé.' }, { status: 404 });
  }

  return NextResponse.json({ pass });
}

/* ── PATCH ────────────────────────────────────────────────────────────────── */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { id: passId } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 });
  }

  if (!body.action || !['revoke', 'sync'].includes(body.action)) {
    return NextResponse.json({ error: 'action doit être "revoke" ou "sync".' }, { status: 400 });
  }

  // Fetch current pass (ownership enforced by restaurant_id filter)
  const { data: pass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, platform, status, object_id, customer_id, pass_version, short_code')
    .eq('id', passId)
    .eq('restaurant_id', guard.restaurantId)
    .single();

  if (!pass) {
    return NextResponse.json({ error: 'Pass introuvable ou accès refusé.' }, { status: 404 });
  }

  /* ── Action: revoke ── */
  if (body.action === 'revoke') {
    if (pass.status !== 'active') {
      return NextResponse.json(
        { error: `Ce pass est déjà "${pass.status}" et ne peut pas être révoqué.` },
        { status: 409 },
      );
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('wallet_passes')
      .update({
        status:       'revoked',
        revoked_at:   new Date().toISOString(),
        pass_version: (pass.pass_version ?? 1) + 1,
      })
      .eq('id', passId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Fire-and-forget: revoke Google object (never blocks the response)
    if (pass.platform === 'google' && pass.object_id) {
      void revokeLoyaltyObject(pass.object_id).catch(() => {/* silent */});
    }

    return NextResponse.json({ pass: updated });
  }

  /* ── Action: sync ── */
  if (body.action === 'sync') {
    if (pass.platform !== 'google') {
      return NextResponse.json(
        { error: 'Les passes Apple sont mis à jour en direct au téléchargement.' },
        { status: 400 },
      );
    }
    if (!pass.object_id) {
      return NextResponse.json(
        { error: 'Ce pass Google n\'a pas encore d\'object_id — il n\'a pas pu être créé via l\'API.' },
        { status: 409 },
      );
    }

    // Fetch live customer data
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, total_points, stamps_count, qr_token')
      .eq('id', pass.customer_id)
      .eq('restaurant_id', guard.restaurantId)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Client introuvable.' }, { status: 404 });
    }

    // Fetch loyalty settings — program_type drives which field is primary on the pass
    const { data: settings } = await supabaseAdmin
      .from('loyalty_settings')
      .select('stamps_total, reward_message, program_type')
      .eq('restaurant_id', guard.restaurantId)
      .maybeSingle();

    const passKind = (settings?.program_type ?? 'points') as 'stamps' | 'points';

    // If this pass has a short_code, align the Google Wallet barcode with it.
    // This is idempotent — already-aligned passes are unaffected.
    const shortCode = (pass as any).short_code as string | null | undefined;
    const barcodeQrToken = customer.qr_token ?? customer.id;
    const barcodeValue = shortCode ?? barcodeQrToken;

    const result = await updateLoyaltyObject(pass.object_id, {
      passKind,
      totalPoints:   customer.total_points  ?? 0,
      stampsCount:   customer.stamps_count  ?? 0,
      stampsTotal:   settings?.stamps_total ?? 10,
      rewardMessage: settings?.reward_message ?? undefined,
      barcode:       { value: barcodeValue, alternateText: shortCode ?? barcodeQrToken.replace(/-/g, '').slice(0, 8).toUpperCase() },
    });

    const now = new Date().toISOString();
    await supabaseAdmin
      .from('wallet_passes')
      .update({
        last_synced_at: result.ok ? now : undefined,
        sync_error:     result.ok ? null : (result.error ?? 'Sync failed'),
        pass_version:   (pass.pass_version ?? 1) + 1,
      })
      .eq('id', passId);

    return NextResponse.json({
      synced:    result.ok,
      syncError: result.ok ? null : (result.error ?? 'Sync failed'),
    });
  }

  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
}
