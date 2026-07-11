// Désabonnement PUBLIC des annonces d'événements (acheteurs de billets).
// RGPD / CAN-SPAM : le lien figure dans chaque email de campagne. Le token
// est un code de billet (non devinable, déjà secret dans nos URLs) ; l'effet
// est global : marketing_opt_in = false pour TOUTES les lignes du même email
// chez le même organisateur. Idempotent, aucune donnée exposée en retour.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ prefix: 'event-unsub', limit: 20, windowMs: 60_000 });

export async function GET(req: NextRequest) {
  if (!limiter.check(getClientIp(req)).success) {
    return pageResponse(429, 'error');
  }

  const code = (req.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase();
  if (!/^EV-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
    return pageResponse(400, 'error');
  }

  const { data: ticket } = await supabaseAdmin
    .from('event_tickets')
    .select('restaurant_id, buyer_email')
    .eq('code', code)
    .maybeSingle();
  // Réponse identique billet inconnu / connu : rien à sonder.
  if (ticket) {
    await supabaseAdmin
      .from('event_tickets')
      .update({ marketing_opt_in: false })
      .eq('restaurant_id', ticket.restaurant_id)
      .eq('buyer_email', ticket.buyer_email);
  }
  return pageResponse(200, 'ok');
}

function pageResponse(status: number, kind: 'ok' | 'error'): Response {
  const body = kind === 'ok'
    ? '<h1>Désabonnement confirmé</h1><p>Vous ne recevrez plus les annonces d\'événements de cet organisateur.</p>'
    : '<h1>Lien invalide</h1><p>Ce lien de désabonnement n\'est pas valide.</p>';
  return new Response(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Désabonnement</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F8F9FA;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
<div style="background:#fff;border-radius:16px;padding:40px;max-width:420px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.06);">${body}
<p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Rebites Events</p></div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
