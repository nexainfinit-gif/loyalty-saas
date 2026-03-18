import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';
import { generateWalletUrl, generateSaveJwt, computeClassId, issueGooglePass, updateLoyaltyObject } from '@/lib/google-wallet';
import { randomUUID } from 'crypto';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  // Auth: platform owner only
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { customerId } = await params;

  // Fetch customer and assert it belongs to the authenticated owner's restaurant
  const { data: customer, error: cErr } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, qr_token, stamps_count, total_points, restaurant_id')
    .eq('id', customerId)
    .eq('restaurant_id', guard.restaurantId)
    .single();

  if (cErr || !customer) {
    return NextResponse.json({ error: 'Client introuvable.' }, { status: 404 });
  }

  const { data: restaurant, error: rErr } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color, logo_url')
    .eq('id', guard.restaurantId)
    .single();

  if (rErr || !restaurant) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  // ── Check for an existing active Google pass for this customer ────────────
  const { data: existingPass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, object_id, wallet_pass_templates(pass_kind)')
    .eq('customer_id', customerId)
    .eq('restaurant_id', guard.restaurantId)
    .eq('platform', 'google')
    .eq('status', 'active')
    .maybeSingle();

  if (existingPass && existingPass.object_id) {
    // passKind: loyalty_settings.program_type is the source of truth — ensures
    // the card type (stamps vs points) always matches the active program.
    const { data: lsForSync } = await supabaseAdmin
      .from('loyalty_settings')
      .select('stamps_total, program_type')
      .eq('restaurant_id', guard.restaurantId)
      .maybeSingle();

    const effectivePassKind = (lsForSync?.program_type === 'stamps' ? 'stamps' : 'points') as 'stamps' | 'points';

    // Update existing pass with latest loyalty state — fire-and-forget
    void updateLoyaltyObject(existingPass.object_id, {
      passKind:    effectivePassKind,
      totalPoints: customer.total_points ?? 0,
      stampsCount: customer.stamps_count ?? 0,
      stampsTotal: lsForSync?.stamps_total ?? 10,
    }).then(result => {
      if (!result.ok) {
        console.error(
          `[wallet/customerId] sync failed objectId=${existingPass.object_id}` +
          ` HTTP ${result.status}` +
          (result.error ? ` error=${result.error}` : ''),
        );
      }
      if (result.ok) {
        return supabaseAdmin
          .from('wallet_passes')
          .update({ last_synced_at: new Date().toISOString(), sync_error: null })
          .eq('id', existingPass.id);
      }
    }).catch((err) => {
      console.error('[wallet/customerId] sync unhandled error:', err instanceof Error ? err.message : String(err));
    });

    // Reconstruct the save JWT using the stored objectId (Phase-3 naming) and the
    // restaurantId-based classId. This ensures Google presents the EXISTING object
    // rather than trying to create a new one with a mismatched ID.
    const classId  = computeClassId(guard.restaurantId, effectivePassKind);

    const saveUrl = generateSaveJwt({
      objectId:        existingPass.object_id,
      classId,
      customerId:      customer.id,
      displayName:     `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
      totalPoints:     customer.total_points  ?? 0,
      stampsCount:     customer.stamps_count  ?? 0,
      stampsTotal:     lsForSync?.stamps_total ?? 10,
      rewardThreshold: 100,
      rewardMessage:   'Récompense offerte !',
      qrToken:         customer.qr_token ?? customer.id,
      restaurantName:  restaurant.name,
      primaryColor:    restaurant.primary_color ?? '#4f6bed',
      passKind:        effectivePassKind,
    });

    await supabaseAdmin
      .from('customers')
      .update({ wallet_card_url: saveUrl })
      .eq('id', customerId);

    return NextResponse.json({ walletUrl: saveUrl });
  }

  // ── No existing pass: issue a new one ─────────────────────────────────────

  // Try to find the restaurant's default (or any published) template
  const { data: defaultTemplate } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id, pass_kind, config_json, primary_color')
    .eq('restaurant_id', guard.restaurantId)
    .eq('status', 'published')
    .eq('is_default', true)
    .maybeSingle();

  const { data: anyTemplate } = defaultTemplate
    ? { data: defaultTemplate }
    : await supabaseAdmin
        .from('wallet_pass_templates')
        .select('id, pass_kind, config_json, primary_color')
        .eq('restaurant_id', guard.restaurantId)
        .eq('status', 'published')
        .limit(1)
        .maybeSingle();

  if (anyTemplate) {
    // Fetch loyalty settings for resolved config
    const { data: loyaltySettings } = await supabaseAdmin
      .from('loyalty_settings')
      .select('stamps_total, reward_threshold, reward_message, points_per_scan, program_type')
      .eq('restaurant_id', guard.restaurantId)
      .maybeSingle();

    // passKind: loyalty_settings.program_type is the source of truth
    const newPassKind = (loyaltySettings?.program_type === 'stamps' ? 'stamps' : 'points') as 'stamps' | 'points';

    const resolvedConfig: Record<string, unknown> = {
      ...((anyTemplate.config_json as Record<string, unknown>) ?? {}),
      ...(loyaltySettings ?? {}),
    };

    const passId = randomUUID();

    const { saveUrl, objectId, synced } = await issueGooglePass({
      passId,
      restaurantId:   guard.restaurantId,
      customerId:     customer.id,
      firstName:      customer.first_name  ?? '',
      lastName:       customer.last_name   ?? '',
      totalPoints:    customer.total_points ?? 0,
      stampsCount:    customer.stamps_count ?? 0,
      qrToken:        customer.qr_token    ?? customer.id,
      restaurantName: restaurant.name,
      primaryColor:   anyTemplate.primary_color ?? restaurant.primary_color ?? '#4f6bed',
      logoUrl:        restaurant.logo_url,
      passKind:       newPassKind,
      configJson:     resolvedConfig,
    });

    // Track the pass in DB
    await supabaseAdmin
      .from('wallet_passes')
      .insert({
        id:             passId,
        restaurant_id:  guard.restaurantId,
        customer_id:    customerId,
        template_id:    anyTemplate.id,
        platform:       'google',
        status:         'active',
        object_id:      objectId,
        last_synced_at: synced ? new Date().toISOString() : null,
        sync_error:     synced ? null : 'Initial sync failed',
      })
      .select()
      .maybeSingle();

    await supabaseAdmin
      .from('customers')
      .update({ wallet_card_url: saveUrl })
      .eq('id', customerId);

    return NextResponse.json({ walletUrl: saveUrl });
  }

  // ── Fallback: no template available — JWT-only (legacy behavior) ──────────
  const walletUrl = await generateWalletUrl({
    customerId:     customer.id,
    firstName:      customer.first_name  ?? '',
    totalPoints:    customer.total_points ?? 0,
    restaurantName: restaurant.name,
    restaurantId:   guard.restaurantId,
    primaryColor:   restaurant.primary_color ?? '#4f6bed',
    logoUrl:        restaurant.logo_url,
  });

  await supabaseAdmin
    .from('customers')
    .update({ wallet_card_url: walletUrl })
    .eq('id', customerId);

  return NextResponse.json({ walletUrl });
}
