export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildPkpass, pkpassResponse } from '@/lib/apple-wallet';
import type { PassBuildInput } from '@/lib/apple-wallet';
import { logger } from '@/lib/logger';

const CTX = 'wallet/webservice/get-pass';

type RouteParams = {
  params: Promise<{ passTypeId: string; serialNumber: string }>;
};

/*
 * GET /api/wallet/webservice/v1/passes/:passTypeId/:serialNumber
 *
 * Return the latest version of a pass as a .pkpass file.
 * Apple calls this endpoint when it detects a pass update via push notification.
 *
 * Authentication: Authorization: ApplePass {authenticationToken}
 *
 * Returns:
 *   200 — .pkpass binary
 *   401 — authentication failed
 *   404 — pass not found
 *   500 — generation error
 *   503 — Apple Wallet not configured
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { passTypeId, serialNumber } = await params;

  // ── Validate auth token ──────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^ApplePass\s+(.+)$/);
  if (!match) {
    logger.warn({ ctx: CTX, msg: 'Missing or invalid Authorization header', serialNumber });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = match[1];

  // ── Fetch pass by serial_number + auth token ─────────────────────────────
  const { data: pass, error: passErr } = await supabaseAdmin
    .from('wallet_passes')
    .select(`
      id,
      platform,
      status,
      serial_number,
      customer_id,
      restaurant_id,
      pass_version,
      authentication_token,
      updated_at,
      template:wallet_pass_templates (
        pass_kind,
        primary_color,
        config_json
      )
    `)
    .eq('serial_number', serialNumber)
    .eq('authentication_token', token)
    .maybeSingle();

  if (passErr || !pass) {
    logger.warn({ ctx: CTX, msg: 'Pass not found or auth failed', serialNumber });
    return NextResponse.json({ error: 'Not found' }, { status: 401 });
  }

  // Verify pass_type_id matches
  const expectedPassTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER ?? '';
  if (expectedPassTypeId && passTypeId !== expectedPassTypeId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (pass.platform !== 'apple') {
    return NextResponse.json({ error: 'Not an Apple pass' }, { status: 404 });
  }

  if (pass.status !== 'active') {
    return NextResponse.json({ error: 'Pass is not active' }, { status: 404 });
  }

  // ── Fetch customer ───────────────────────────────────────────────────────
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, qr_token, stamps_count, total_points')
    .eq('id', pass.customer_id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // ── Fetch restaurant ─────────────────────────────────────────────────────
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color, logo_url')
    .eq('id', pass.restaurant_id)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  // ── Fetch loyalty_settings ───────────────────────────────────────────────
  const { data: loyaltySettings } = await supabaseAdmin
    .from('loyalty_settings')
    .select('stamps_total, reward_threshold, reward_message, points_per_scan, program_type')
    .eq('restaurant_id', pass.restaurant_id)
    .maybeSingle();

  // ── Resolve template ─────────────────────────────────────────────────────
  const tmpl = Array.isArray(pass.template) ? pass.template[0] : pass.template;
  if (!tmpl) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const resolvedConfig: Record<string, unknown> = {
    ...((tmpl.config_json as Record<string, unknown>) ?? {}),
    ...(loyaltySettings ? {
      stamps_total:     loyaltySettings.stamps_total,
      reward_threshold: loyaltySettings.reward_threshold,
      reward_message:   loyaltySettings.reward_message,
      points_per_scan:  loyaltySettings.points_per_scan,
    } : {}),
  };

  // ── Build pkpass ─────────────────────────────────────────────────────────
  // passKind: loyalty_settings.program_type is the source of truth
  const effectivePassKind = (loyaltySettings?.program_type === 'stamps' ? 'stamps' : 'points') as 'stamps' | 'points';

  const input: PassBuildInput = {
    passId:         pass.id,
    serialNumber:   pass.serial_number ?? pass.id,
    passKind:       effectivePassKind,
    configJson:     resolvedConfig,
    primaryColor:   tmpl.primary_color ?? restaurant.primary_color,
    customerId:     customer.id,
    firstName:      customer.first_name ?? '',
    lastName:       customer.last_name  ?? '',
    stampsCount:    customer.stamps_count  ?? 0,
    totalPoints:    customer.total_points  ?? 0,
    qrToken:        customer.qr_token      ?? pass.id,
    restaurantName:      restaurant.name,
    logoUrl:             restaurant.logo_url,
    authenticationToken: pass.authentication_token,
  };

  try {
    const buffer = await buildPkpass(input);

    logger.info({ ctx: CTX, msg: 'Served updated pass', serialNumber, passId: pass.id });

    const filename = `${restaurant.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-pass.pkpass`;
    const response = pkpassResponse(buffer, filename);

    // Add Last-Modified header for Apple
    const lastModified = pass.updated_at
      ? new Date(pass.updated_at).toUTCString()
      : new Date().toUTCString();

    return new Response(response.body, {
      status: 200,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'Last-Modified': lastModified,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('manquant') || message.includes('APPLE_')) {
      logger.warn({ ctx: CTX, msg: 'Apple Wallet not configured', err: message });
      return NextResponse.json({ error: 'Apple Wallet not configured' }, { status: 503 });
    }

    logger.error({ ctx: CTX, msg: 'Failed to generate pkpass', err, serialNumber });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
