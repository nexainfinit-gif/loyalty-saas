export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildPkpass, pkpassResponse } from '@/lib/apple-wallet';
import type { PassBuildInput } from '@/lib/apple-wallet';
import { resolveEventTheme } from '@/lib/event-themes';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { pkpassCache } from '@/lib/pkpass-cache';
import { logger } from '@/lib/logger';

// La génération pkpass est coûteuse (Sharp + JSZip + signature)
const limiter = rateLimit({ prefix: 'event-pkpass', limit: 10, windowMs: 60_000 });

/*
 * GET /api/event/ticket/[code]/pkpass — billet Apple Wallet (eventTicket).
 *
 * Chemin DÉLIBÉRÉMENT séparé de wallet_passes/customers : un acheteur de
 * billet n'est pas un client fidélité. Le pass est STATIQUE (pas de
 * webServiceURL/authenticationToken — rien à pousser sur un billet), le code
 * du billet fait office de secret ET de contenu du QR (même valeur que la
 * page web → prêt pour le check-in scanner T2).
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

  // Habillage du pass = thème de l'événement (cohérent avec la page billet)
  const T = resolveEventTheme(event.theme);
  const d = new Date(event.starts_at);
  const eventDate = d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const eventTime = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });

  const [firstName, ...rest] = (ticket.buyer_name ?? '').trim().split(/\s+/);

  const input: PassBuildInput = {
    passId:       ticket.id,
    serialNumber: `evt-${ticket.id}`,
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
      relevant_date:   d.toISOString(),
      // Couleurs du thème (fond = en-tête du billet web, encre = headerInk)
      foregroundColor: T.headerInk ?? '#FFFFFF',
      labelColor:      T.headerInk ?? '#FFFFFF',
      barcodeAltText:  ticket.code,
      showLogoText:    true,
      logoText:        restaurant.name,
    },
    primaryColor:   T.headerBg,
    customerId:     ticket.id,
    firstName:      firstName ?? '',
    lastName:       rest.join(' '),
    stampsCount:    0,
    totalPoints:    0,
    qrToken:        ticket.code,
    restaurantName: restaurant.name,
    logoUrl:        restaurant.logo_url,
    // Pass statique : pas de webservice/push pour un billet
    authenticationToken: null,
  };

  try {
    const cacheKey = `evt:${ticket.id}:${ticket.status}`;
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
