export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildPkpass, pkpassResponse } from '@/lib/apple-wallet';
import type { PassBuildInput } from '@/lib/apple-wallet';
import { randomUUID } from 'crypto';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { pkpassCache } from '@/lib/pkpass-cache';
import { auditLog } from '@/lib/audit';
import { getTranslator, defaultLocale, locales } from '@/lib/i18n-server';
import type { Locale } from '@/lib/i18n-server';

// 10 downloads per minute per IP — pkpass generation is CPU-intensive (Sharp + JSZip + signing)
const limiter = rateLimit({ prefix: 'pkpass-download', limit: 10, windowMs: 60_000 });

/*
 * GET /api/wallet/passes/:id/pkpass
 *
 * Public endpoint — no auth required.
 * The pass UUID is hard-to-guess and acts as a bearer token for this download.
 *
 * Returns: application/vnd.apple.pkpass binary
 *
 * Errors:
 *   404  — pass not found or not an Apple pass
 *   409  — pass is not active (revoked / expired)
 *   429  — too many requests
 *   503  — Apple Wallet env vars not configured
 *   500  — unexpected build/signing error
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { searchParams } = new URL(_request.url);
  const rawLocale = searchParams.get('locale') ?? defaultLocale;
  const locale: Locale = (locales as readonly string[]).includes(rawLocale)
    ? (rawLocale as Locale)
    : defaultLocale;
  const t = await getTranslator(locale);

  const ip = getClientIp(_request);
  if (!limiter.check(ip).success) {
    return NextResponse.json(
      { error: t('api.pkpassRateLimit') },
      { status: 429 },
    );
  }
  const { id: passId } = await params;

  // ── Fetch pass + template ────────────────────────────────────────────────
  const { data: pass, error: passErr } = await supabaseAdmin
    .from('wallet_passes')
    .select(`
      id,
      platform,
      status,
      serial_number,
      authentication_token,
      promo_message,
      customer_id,
      restaurant_id,
      pass_version,
      template:wallet_pass_templates (
        pass_kind,
        primary_color,
        config_json
      )
    `)
    .eq('id', passId)
    .single();

  if (passErr || !pass) {
    return NextResponse.json({ error: t('api.passNotFound') }, { status: 404 });
  }

  // ── Download token — prevents access without the signed link ────────────
  // The authentication_token is a shared secret between the pass and the DB.
  // Requiring it as ?token= ensures only someone with the legitimate link can download.
  const downloadToken = searchParams.get('token');
  const passAuthToken = (pass as { authentication_token?: string | null }).authentication_token;
  if (passAuthToken && downloadToken !== passAuthToken) {
    return NextResponse.json({ error: t('api.passNotFound') }, { status: 404 });
  }

  if (pass.platform !== 'apple') {
    return NextResponse.json(
      { error: t('api.notApplePass') },
      { status: 404 },
    );
  }

  if (pass.status !== 'active') {
    return NextResponse.json(
      { error: t('api.passStatusError', { status: pass.status }) },
      { status: 409 },
    );
  }

  // ── Fetch customer ───────────────────────────────────────────────────────
  const { data: customer, error: custErr } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, qr_token, stamps_count, total_points, reward_pending, referral_code')
    .eq('id', pass.customer_id)
    .single();

  if (custErr || !customer) {
    return NextResponse.json({ error: t('api.customerNotFound') }, { status: 404 });
  }

  // ── Fetch restaurant ─────────────────────────────────────────────────────
  const { data: restaurant, error: restErr } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color, logo_url')
    .eq('id', pass.restaurant_id)
    .single();

  if (restErr || !restaurant) {
    return NextResponse.json({ error: t('api.restaurantNotFound') }, { status: 404 });
  }

  // ── Fetch loyalty_settings to resolve live values ────────────────────────
  const { data: loyaltySettings } = await supabaseAdmin
    .from('loyalty_settings')
    .select('stamps_total, reward_threshold, reward_message, points_per_scan, program_type')
    .eq('restaurant_id', pass.restaurant_id)
    .maybeSingle();

  // ── Resolve template fields (join returns object or array) ───────────────
  const tmpl = Array.isArray(pass.template) ? pass.template[0] : pass.template;
  if (!tmpl) {
    return NextResponse.json({ error: t('api.templateNotFound') }, { status: 404 });
  }

  // Merge: loyalty_settings overrides template config_json for live values.
  // Falls back to config_json when loyalty_settings is not found.
  const resolvedConfig: Record<string, unknown> = {
    ...((tmpl.config_json as Record<string, unknown>) ?? {}),
    ...(loyaltySettings ? {
      stamps_total:     loyaltySettings.stamps_total,
      reward_threshold: loyaltySettings.reward_threshold,
      reward_message:   loyaltySettings.reward_message,
      points_per_scan:  loyaltySettings.points_per_scan,
    } : {}),
  };

  // ── Ensure authentication_token exists (backfill for pre-migration passes) ─
  let authToken: string | null = (pass as { authentication_token?: string | null }).authentication_token ?? null;
  if (!authToken) {
    authToken = randomUUID().replace(/-/g, ''); // 32 hex chars (>16 char Apple minimum)
    await supabaseAdmin
      .from('wallet_passes')
      .update({ authentication_token: authToken })
      .eq('id', passId);
  }

  // ── Build pkpass ─────────────────────────────────────────────────────────
  // passKind: config_json.passKind > template.pass_kind > loyalty_settings
  const cfgPassKind = (resolvedConfig.passKind as string) || null;
  const templatePassKind = tmpl.pass_kind as string | undefined;
  const rawKind = cfgPassKind || templatePassKind || loyaltySettings?.program_type || 'points';
  const effectivePassKind = (
    rawKind === 'stamps' || rawKind === 'points' || rawKind === 'event' ? rawKind : 'points'
  ) as 'stamps' | 'points' | 'event';

  const input: PassBuildInput = {
    passId,
    serialNumber:   pass.serial_number ?? passId,
    passKind:       effectivePassKind,
    configJson:     resolvedConfig,
    primaryColor:   tmpl.primary_color ?? restaurant.primary_color,
    customerId:     customer.id,
    firstName:      customer.first_name ?? '',
    lastName:       customer.last_name  ?? '',
    stampsCount:    customer.stamps_count  ?? 0,
    totalPoints:    customer.total_points  ?? 0,
    qrToken:        customer.qr_token      ?? customer.id,
    restaurantName:      restaurant.name,
    logoUrl:             restaurant.logo_url,
    authenticationToken: authToken,
    rewardPending:       (customer as { reward_pending?: boolean }).reward_pending ?? false,
    referralCode:        (customer as { referral_code?: string | null }).referral_code ?? null,
    promoMessage:        (pass as { promo_message?: string | null }).promo_message ?? null,
  };

  try {
    const passVersion = (pass as { pass_version?: number }).pass_version ?? 1;
    const cacheKey    = `${passId}:${passVersion}`;
    const cached      = pkpassCache.get(cacheKey);

    let buffer: Buffer;
    if (cached) {
      buffer = cached;
    } else {
      buffer = await buildPkpass(input);
      pkpassCache.set(cacheKey, buffer);
    }

    // Audit: log download event (fire-and-forget)
    auditLog({
      restaurantId: pass.restaurant_id,
      action: 'pkpass_download',
      targetType: 'wallet_pass',
      targetId: passId,
      metadata: { ip, customerId: pass.customer_id },
    });

    const filename = `${restaurant.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-pass.pkpass`;
    return pkpassResponse(buffer, filename);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // Configuration error — missing Apple env vars
    if (message.includes('manquant') || message.includes('APPLE_')) {
      console.warn('[pkpass] Apple Wallet non configuré:', message);
      return NextResponse.json(
        { error: t('api.appleWalletNotConfigured') },
        { status: 503 },
      );
    }

    console.error('[pkpass]', err);
    return NextResponse.json(
      { error: t('api.pkpassGenerationError') },
      { status: 500 },
    );
  }
}
