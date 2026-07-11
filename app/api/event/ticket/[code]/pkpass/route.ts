export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildPkpass, pkpassResponse } from '@/lib/apple-wallet';
import type { PassBuildInput } from '@/lib/apple-wallet';
import { resolveEventTheme } from '@/lib/event-themes';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { pkpassCache } from '@/lib/pkpass-cache';
import { logger } from '@/lib/logger';

const limiter = rateLimit({ prefix: 'event-pkpass', limit: 10, windowMs: 60_000 });

/*
 * GET /api/event/ticket/[code]/pkpass — billet Apple Wallet (eventTicket).
 *
 * Pass DYNAMIQUE : une ligne wallet_passes est créée (ou récupérée) au
 * premier téléchargement. webServiceURL + authenticationToken permettent
 * à Apple Wallet de recevoir des push APNS — au check-in le pass se met
 * à jour tout seul (voided + tampon UTILISÉ).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const { code } = await params;
  if (!/^EV-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
    return NextResponse.json({ error: 'Billet introuvable.' }, { status: 404 });
  }

  const { data: ticket } = await supabaseAdmin
    .from('event_tickets')
    .select('id, code, buyer_name, status, event_id, restaurant_id, tier_name, seats')
    .eq('code', code)
    .maybeSingle();
  if (!ticket || (ticket.status !== 'valid' && ticket.status !== 'checked_in')) {
    return NextResponse.json({ error: 'Billet introuvable.' }, { status: 404 });
  }

  const [{ data: event }, { data: restaurant }] = await Promise.all([
    supabaseAdmin.from('events').select('title, location, starts_at, theme').eq('id', ticket.event_id).single(),
    supabaseAdmin.from('restaurants').select('name, primary_color, logo_url').eq('id', ticket.restaurant_id).single(),
  ]);
  if (!event || !restaurant) {
    return NextResponse.json({ error: 'Billet introuvable.' }, { status: 404 });
  }

  // ── wallet_passes : créer ou récupérer le row pour ce billet ────────────
  const serialNumber = `evt-${ticket.id}`;
  let walletPass = await getOrCreateWalletPass(ticket, serialNumber);

  const T = resolveEventTheme(event.theme);
  const d = new Date(event.starts_at);
  const tz = 'Europe/Brussels';
  const eventDate = d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
  const eventTime = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', timeZone: tz });

  const shortDate = d.toLocaleDateString('fr-BE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz,
  });
  const stripSubtitle = `${shortDate} à ${eventTime}${event.location ? ` — ${event.location}` : ''}`;

  const [firstName, ...rest] = (ticket.buyer_name ?? '').trim().split(/\s+/);
  const isVoided = ticket.status === 'checked_in';

  // Design « billet tonal » : UNE seule couleur de fond (thème) pour tout le
  // pass — le strip a le même fond, aucune rupture visuelle (réf. e-tickets
  // Dribbble). L'encre et l'accent suivent le thème.
  const inkColor    = T.headerInk ?? '#FFFFFF';
  const accentColor = T.headerInk ? T.accent : (T.dark ? T.accent : T.accent2);

  const input: PassBuildInput = {
    passId:       walletPass?.id ?? ticket.id,
    serialNumber,
    passKind:     'event',
    configJson: {
      event_name:      event.title,
      event_date:      eventDate,
      event_time:      eventTime,
      event_location:  event.location ?? '',
      ticket_code:     ticket.code,
      tier_label:      ticket.tier_name
        ? ((ticket.seats ?? 1) > 1 ? `${ticket.tier_name} · ${ticket.seats} places` : ticket.tier_name)
        : '',
      strip_title:       event.title,
      strip_subtitle:    stripSubtitle,
      strip_org:         restaurant.name,
      strip_org_color:   accentColor,
      strip_title_color: inkColor,
      voided:            isVoided,
      relevant_date:     d.toISOString(),
      // Tonal : strip et pass partagent le même fond thème
      bgColor:           T.headerBg,
      perfoColor:        T.headerInk ? 'rgba(28,25,23,0.3)' : 'rgba(255,255,255,0.3)',
      foregroundColor:   inkColor,
      labelColor:        accentColor,
      barcodeAltText:    ticket.code,
      // L'organisateur est déjà dans le strip — pas de doublon en haut
      showLogoText:      false,
    },
    // backgroundColor du pass = fond du thème (continu avec le strip)
    primaryColor:   T.headerBg,
    customerId:     ticket.id,
    firstName:      firstName ?? '',
    lastName:       rest.join(' '),
    stampsCount:    0,
    totalPoints:    0,
    qrToken:        ticket.code,
    restaurantName: restaurant.name,
    logoUrl:        restaurant.logo_url,
    authenticationToken: walletPass?.authentication_token ?? null,
  };

  try {
    const cacheKey = `evt:${ticket.id}:${ticket.status}:${walletPass?.pass_version ?? 0}`;
    let buffer = pkpassCache.get(cacheKey);
    if (!buffer) {
      buffer = await buildPkpass(input);
      pkpassCache.set(cacheKey, buffer);
    }
    return pkpassResponse(buffer, `billet-${ticket.code.toLowerCase()}.pkpass`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('manquant') || message.includes('APPLE_')) {
      logger.warn({ ctx: 'event-pkpass', rid: ticket.restaurant_id, msg: 'apple wallet not configured', err: message });
      return NextResponse.json({ error: 'Apple Wallet indisponible pour le moment.' }, { status: 503 });
    }
    logger.error({ ctx: 'event-pkpass', rid: ticket.restaurant_id, msg: 'build failed', err: message });
    return NextResponse.json({ error: 'Erreur lors de la génération du billet.' }, { status: 500 });
  }
}

/* ── Helper : get-or-create wallet_passes row pour push dynamique ─────── */

async function getOrCreateWalletPass(
  ticket: { id: string; restaurant_id: string },
  serialNumber: string,
): Promise<{ id: string; authentication_token: string; pass_version: number } | null> {
  // Existing row?
  const { data: existing } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, authentication_token, pass_version')
    .eq('event_ticket_id', ticket.id)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) return existing;

  // Create — needs a template_id (FK NOT NULL in the table). Use the
  // restaurant's default published template if one exists, otherwise
  // skip dynamic registration (pass stays functional without push).
  const { data: tmpl } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id')
    .eq('restaurant_id', ticket.restaurant_id)
    .eq('status', 'published')
    .eq('is_default', true)
    .maybeSingle();
  if (!tmpl) {
    logger.info({ ctx: 'event-pkpass', msg: 'no template — pass will be static', rid: ticket.restaurant_id });
    return null;
  }

  const passId    = randomUUID();
  const shortCode = passId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const authToken = randomUUID().replace(/-/g, '');

  const { data: row, error } = await supabaseAdmin
    .from('wallet_passes')
    .insert({
      id:                   passId,
      short_code:           shortCode,
      restaurant_id:        ticket.restaurant_id,
      event_ticket_id:      ticket.id,
      template_id:          tmpl.id,
      platform:             'apple',
      status:               'active',
      pass_kind:            'event',
      serial_number:        serialNumber,
      authentication_token: authToken,
    })
    .select('id, authentication_token, pass_version')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Race: another request just created it — fetch and return
      const { data: raced } = await supabaseAdmin
        .from('wallet_passes')
        .select('id, authentication_token, pass_version')
        .eq('event_ticket_id', ticket.id)
        .eq('status', 'active')
        .maybeSingle();
      return raced ?? null;
    }
    logger.error({ ctx: 'event-pkpass', msg: 'wallet_passes insert failed', err: error.message });
    return null;
  }
  return row;
}
