export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildPkpass, pkpassResponse } from '@/lib/apple-wallet';
import { isBookingEligible } from '@/lib/booking-eligibility';
import { resolveEventTheme } from '@/lib/event-themes';
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
      event_ticket_id,
      restaurant_id,
      pass_version,
      authentication_token,
      promo_message,
      updated_at,
      pass_kind,
      total_points,
      stamps_count,
      reward_pending,
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

  // ── Fetch restaurant (common to all pass kinds) ─────────────────────────
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, business_type, primary_color, logo_url')
    .eq('id', pass.restaurant_id)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  // ── EVENT TICKET pass — completely different data source ────────────────
  const passKindRaw = (pass as { pass_kind?: string }).pass_kind;
  const eventTicketId = (pass as { event_ticket_id?: string | null }).event_ticket_id;

  if (passKindRaw === 'event' && eventTicketId) {
    return serveEventPass(pass, eventTicketId, restaurant, request);
  }

  // ── LOYALTY pass (stamps / points) ─────────────────────────────────────
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, qr_token, stamps_count, total_points, reward_pending, referral_code')
    .eq('id', pass.customer_id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const { data: loyaltySettings } = await supabaseAdmin
    .from('loyalty_settings')
    .select('stamps_total, reward_threshold, reward_message, points_per_scan, program_type')
    .eq('restaurant_id', pass.restaurant_id)
    .maybeSingle();

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

  const passOwnKind = passKindRaw || null;
  const lsKind = loyaltySettings?.program_type as string | undefined;
  const cfgPassKind = (resolvedConfig.passKind as string) || null;
  const templatePassKind = tmpl.pass_kind as string | undefined;
  const rawKind = passOwnKind || lsKind || cfgPassKind || templatePassKind || 'points';
  const effectivePassKind = (
    rawKind === 'stamps' || rawKind === 'points' ? rawKind : 'points'
  ) as 'stamps' | 'points';

  const input: PassBuildInput = {
    passId:         pass.id,
    serialNumber:   pass.serial_number ?? pass.id,
    passKind:       effectivePassKind,
    configJson:     resolvedConfig,
    primaryColor:   tmpl.primary_color ?? restaurant.primary_color,
    customerId:     customer.id,
    firstName:      customer.first_name ?? '',
    lastName:       customer.last_name  ?? '',
    stampsCount:    (pass as { stamps_count?: number }).stamps_count  ?? customer.stamps_count  ?? 0,
    totalPoints:    (pass as { total_points?: number }).total_points  ?? customer.total_points  ?? 0,
    qrToken:        customer.qr_token      ?? customer.id,
    restaurantName:      restaurant.name,
    logoUrl:             restaurant.logo_url,
    authenticationToken: pass.authentication_token,
    rewardPending:       (pass as { reward_pending?: boolean }).reward_pending ?? (customer as { reward_pending?: boolean }).reward_pending ?? false,
    referralCode:        (customer as { referral_code?: string | null }).referral_code ?? null,
    promoMessage:        (pass as { promo_message?: string | null }).promo_message ?? null,
    bookingUrl:          isBookingEligible((restaurant as { business_type?: string | null }).business_type)
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/fr/book/${(restaurant as { slug?: string }).slug}`
      : null,
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

/* ── Serve an event ticket pass (called from GET when pass_kind=event) ─── */

async function serveEventPass(
  pass: { id: string; serial_number: string; authentication_token: string; updated_at?: string },
  eventTicketId: string,
  restaurant: { id: string; name: string; primary_color: string | null; logo_url: string | null },
  _request: Request,
) {
  const { data: ticket } = await supabaseAdmin
    .from('event_tickets')
    .select('id, code, buyer_name, status, event_id, tier_name, seats')
    .eq('id', eventTicketId)
    .maybeSingle();
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('title, location, starts_at, theme')
    .eq('id', ticket.event_id)
    .single();
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const T = resolveEventTheme(event.theme);
  const d = new Date(event.starts_at);
  const tz = 'Europe/Brussels';
  const eventDate = d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
  const eventTime = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const shortDate = d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
  const stripSubtitle = `${shortDate} à ${eventTime}${event.location ? ` — ${event.location}` : ''}`;

  const [firstName, ...rest] = (ticket.buyer_name ?? '').trim().split(/\s+/);
  const isVoided = ticket.status === 'checked_in';
  const accentColor = T.headerInk ? T.accent : (T.dark ? T.accent : T.accent2);

  const input: PassBuildInput = {
    passId:       pass.id,
    serialNumber: pass.serial_number ?? pass.id,
    passKind:     'event',
    configJson: {
      event_name:        event.title,
      event_date:        eventDate,
      event_time:        eventTime,
      event_location:    event.location ?? '',
      ticket_code:       ticket.code,
      tier_label:        ticket.tier_name
        ? ((ticket.seats ?? 1) > 1 ? `${ticket.tier_name} · ${ticket.seats} places` : ticket.tier_name)
        : '',
      strip_title:       event.title,
      strip_subtitle:    stripSubtitle,
      strip_org:         restaurant.name,
      strip_org_color:   accentColor,
      strip_title_color: T.headerInk ?? '#FFFFFF',
      voided:            isVoided,
      relevant_date:     d.toISOString(),
      bgColor:           T.headerBg,
      perfoColor:        T.headerInk ? 'rgba(28,25,23,0.3)' : 'rgba(255,255,255,0.3)',
      foregroundColor:   '#1C1917',
      labelColor:        accentColor,
      barcodeAltText:    ticket.code,
      showLogoText:      true,
      logoText:          restaurant.name,
    },
    primaryColor:        '#FDFDFB',
    customerId:          ticket.id,
    firstName:           firstName ?? '',
    lastName:            rest.join(' '),
    stampsCount:         0,
    totalPoints:         0,
    qrToken:             ticket.code,
    restaurantName:      restaurant.name,
    logoUrl:             restaurant.logo_url,
    authenticationToken: pass.authentication_token,
  };

  try {
    const buffer = await buildPkpass(input);
    logger.info({ ctx: CTX, msg: 'Served updated event pass', serialNumber: pass.serial_number, passId: pass.id });
    const filename = `billet-${ticket.code.toLowerCase()}.pkpass`;
    const response = pkpassResponse(buffer, filename);
    const lastModified = pass.updated_at ? new Date(pass.updated_at).toUTCString() : new Date().toUTCString();
    return new Response(response.body, {
      status: 200,
      headers: { ...Object.fromEntries(response.headers.entries()), 'Last-Modified': lastModified },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('manquant') || message.includes('APPLE_')) {
      return NextResponse.json({ error: 'Apple Wallet not configured' }, { status: 503 });
    }
    logger.error({ ctx: CTX, msg: 'Failed to generate event pkpass', err, passId: pass.id });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
