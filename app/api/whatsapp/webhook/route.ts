import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  verifyWebhookSignature,
  parseInboundButtonTaps,
  sendWhatsAppText,
  type InboundButtonTap,
} from '@/lib/whatsapp';

/**
 * Webhook WhatsApp Business (Meta Cloud API).
 *
 * GET  — handshake de vérification Meta (hub.challenge).
 * POST — messages entrants. On ne traite que les taps sur les boutons
 *        quick-reply « Confirmer » / « Annuler » des rappels de RDV.
 *
 * ANNULER réutilise l'endpoint public existant POST /api/book/cancel/[token]
 * (donc TOUTES ses règles : délai d'annulation, liste d'attente, refresh
 * Wallet) — zéro duplication de business logic. CONFIRMER est un simple
 * accusé (le RDV est déjà « confirmed »), qui rassure le client et réduit le
 * no-show. La réponse texte est gratuite : le tap ouvre la fenêtre de 24 h.
 *
 * Sécurité : signature X-Hub-Signature-256 vérifiée (HMAC app secret). Le
 * token porté par le bouton est le cancel_token (capability déjà publique via
 * le lien d'annulation par email) — l'annulation reste bornée à ce qui est
 * déjà exposé.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get('hub.mode');
  const token = p.get('hub.verify_token');
  const challenge = p.get('hub.challenge');
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && expected && token === expected) {
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get('x-hub-signature-256');

  if (!verifyWebhookSignature(raw, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ received: true }); // 200 → pas de retry Meta
  }

  const taps = parseInboundButtonTaps(body);
  // Traite en parallèle, best-effort. On répond toujours 200 à Meta.
  await Promise.allSettled(taps.map((tap) => handleTap(tap)));

  return NextResponse.json({ received: true });
}

async function handleTap(tap: InboundButtonTap): Promise<void> {
  try {
    const action = tap.action.toUpperCase();
    if (!UUID_RE.test(tap.token)) return; // payload non conforme → ignore

    if (action === 'CONFIRM') {
      await sendWhatsAppText(
        tap.from,
        'Merci, votre présence est confirmée ✅. À très bientôt !',
      );
      return;
    }

    if (action === 'CANCEL') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebites.be';
      let ok = false;
      let errorMsg = '';
      try {
        const res = await fetch(`${appUrl}/api/book/cancel/${tap.token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        ok = res.ok;
        if (!ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          errorMsg = j?.error ?? '';
        }
      } catch (err) {
        logger.error({
          ctx: 'whatsapp-webhook',
          msg: 'cancel call failed',
          err: err instanceof Error ? err.message : String(err),
        });
      }

      await sendWhatsAppText(
        tap.from,
        ok
          ? 'Votre rendez-vous a bien été annulé. À bientôt !'
          : errorMsg ||
              "Nous n'avons pas pu annuler en ligne. Merci de contacter directement l'établissement.",
      );
      return;
    }
    // action inconnue → ignore
  } catch (err) {
    logger.error({
      ctx: 'whatsapp-webhook',
      msg: 'handleTap failed',
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
