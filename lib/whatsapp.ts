import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * WhatsApp Business — niveau 2 de la cascade de rappels Rebites.
 *
 * Intégration DIRECTE à l'API Meta Cloud (aucun intermédiaire type Twilio →
 * pas de markup). N'est utilisé QUE pour les clients que la carte Wallet ne
 * couvre pas (cf. cascade dans le cron reminders) : la notification Wallet
 * reste gratuite et prioritaire.
 *
 * Env requis (sinon toutes les fonctions no-op proprement) :
 *   WHATSAPP_TOKEN            — token permanent de l'app WhatsApp Business
 *   WHATSAPP_PHONE_NUMBER_ID  — id du numéro expéditeur (pas le numéro lui-même)
 *   WHATSAPP_REMINDER_TEMPLATE (optionnel) — nom du template utility approuvé
 *                               par Meta. Défaut : 'appointment_reminder'.
 *
 * Le template utility attendu côté Meta a 3 variables de corps, dans l'ordre :
 *   {{1}} = nom du client, {{2}} = nom du salon, {{3}} = « Demain à 14:30 ».
 * Exemple de corps FR : « Bonjour {{1}}, rappel de votre rendez-vous chez
 * {{2}} : {{3}}. À très vite ! »
 */

const GRAPH_VERSION = 'v21.0';

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Normalise un numéro en E.164 sans « + » (format attendu par l'API Meta).
 * Pays par défaut = Belgique (32) pour les numéros nationaux (0…).
 * Retourne null si le numéro est manifestement invalide.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry = '32',
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits: string;

  if (trimmed.startsWith('+')) {
    digits = trimmed.slice(1).replace(/\D/g, '');
  } else {
    const cleaned = trimmed.replace(/\D/g, '');
    if (cleaned.startsWith('00')) {
      digits = cleaned.slice(2); // préfixe international 00 → indicatif pays
    } else if (cleaned.startsWith('0')) {
      digits = defaultCountry + cleaned.slice(1); // numéro national → +pays
    } else {
      digits = cleaned; // supposé déjà international
    }
  }

  // E.164 : 8 à 15 chiffres. Rejette les valeurs improbables.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export interface WhatsAppTemplateParams {
  to: string;
  template: string;
  languageCode?: string;
  bodyParams: string[];
  /**
   * Payloads dynamiques des boutons quick-reply du template (dans l'ordre où
   * ils sont définis côté Meta). Ex. ['CONFIRM:<token>', 'CANCEL:<token>'].
   * Le template DOIT déclarer autant de boutons quick-reply. Omettre pour un
   * template sans bouton.
   */
  buttonPayloads?: string[];
}

type SendResult = { ok: boolean; skipped?: string; error?: string };

/** Envoie un message template. Ne lève JAMAIS. */
export async function sendWhatsAppTemplate(params: WhatsAppTemplateParams): Promise<SendResult> {
  if (!isWhatsAppConfigured()) return { ok: false, skipped: 'not_configured' };

  const to = normalizePhone(params.to);
  if (!to) return { ok: false, skipped: 'invalid_phone' };

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_TOKEN!;

  const components: unknown[] = [
    {
      type: 'body',
      parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
    },
  ];
  // Boutons quick-reply avec payload dynamique (Confirmer / Annuler).
  (params.buttonPayloads ?? []).forEach((payload, index) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(index),
      parameters: [{ type: 'payload', payload }],
    });
  });

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: params.template,
            language: { code: params.languageCode ?? 'fr' },
            components,
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({
        ctx: 'whatsapp',
        msg: 'send failed',
        status: res.status,
        body: body.slice(0, 500),
      });
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    logger.error({
      ctx: 'whatsapp',
      msg: 'send threw',
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'exception' };
  }
}

/**
 * Rappel de rendez-vous (template utility). Helper de haut niveau utilisé par
 * le cron reminders. `dateTimeLabel` = ex. « Demain à 14:30 ».
 */
export async function sendAppointmentReminderWhatsApp(args: {
  to: string;
  clientName: string;
  businessName: string;
  dateTimeLabel: string;
  languageCode?: string;
  /** cancel_token du RDV — active les boutons Confirmer / Annuler s'il est fourni. */
  cancelToken?: string | null;
}): Promise<SendResult> {
  return sendWhatsAppTemplate({
    to: args.to,
    template: process.env.WHATSAPP_REMINDER_TEMPLATE ?? 'appointment_reminder',
    languageCode: args.languageCode ?? 'fr',
    bodyParams: [args.clientName || 'client', args.businessName, args.dateTimeLabel],
    buttonPayloads: args.cancelToken
      ? [`CONFIRM:${args.cancelToken}`, `CANCEL:${args.cancelToken}`]
      : undefined,
  });
}

/**
 * Message texte libre (hors template). Autorisé — et GRATUIT — uniquement dans
 * la fenêtre de service de 24 h ouverte par un message entrant du client (ex.
 * un tap sur un bouton). Utilisé pour accuser réception d'un Confirmer/Annuler.
 */
export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  if (!isWhatsAppConfigured()) return { ok: false, skipped: 'not_configured' };
  const normalized = normalizePhone(to);
  if (!normalized) return { ok: false, skipped: 'invalid_phone' };

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_TOKEN!;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalized,
          type: 'text',
          text: { body },
        }),
      },
    );
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'exception' };
  }
}

/**
 * Vérifie la signature Meta (X-Hub-Signature-256) d'un webhook entrant, en
 * timing-safe. Retourne false si le secret n'est pas configuré (on refuse de
 * traiter un webhook non authentifiable).
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface InboundButtonTap {
  from: string;      // numéro E.164 de l'expéditeur
  action: string;    // ex. 'CONFIRM' | 'CANCEL'
  token: string;     // cancel_token du RDV
}

/**
 * Extrait les taps de boutons quick-reply d'un payload webhook Meta. Gère à la
 * fois les boutons de template (type 'button') et les boutons interactifs
 * (type 'interactive' → button_reply). Ignore silencieusement tout le reste
 * (accusés de livraison, messages texte, payloads malformés).
 */
export function parseInboundButtonTaps(webhookBody: unknown): InboundButtonTap[] {
  const taps: InboundButtonTap[] = [];
  try {
    const entries = (webhookBody as { entry?: unknown[] })?.entry ?? [];
    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes ?? [];
      for (const change of changes) {
        const messages = (change as { value?: { messages?: unknown[] } })?.value?.messages ?? [];
        for (const msg of messages) {
          const m = msg as {
            from?: string;
            type?: string;
            button?: { payload?: string };
            interactive?: { button_reply?: { id?: string } };
          };
          const payload =
            m.type === 'button' ? m.button?.payload :
            m.type === 'interactive' ? m.interactive?.button_reply?.id :
            undefined;
          if (!m.from || !payload) continue;
          const sep = payload.indexOf(':');
          if (sep <= 0) continue;
          const action = payload.slice(0, sep);
          const tokenPart = payload.slice(sep + 1);
          if (!action || !tokenPart) continue;
          taps.push({ from: m.from, action, token: tokenPart });
        }
      }
    }
  } catch {
    /* payload malformé → aucun tap */
  }
  return taps;
}
