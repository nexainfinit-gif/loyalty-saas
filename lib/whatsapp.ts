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
}

type SendResult = { ok: boolean; skipped?: string; error?: string };

/** Envoie un message template. Ne lève JAMAIS. */
export async function sendWhatsAppTemplate(params: WhatsAppTemplateParams): Promise<SendResult> {
  if (!isWhatsAppConfigured()) return { ok: false, skipped: 'not_configured' };

  const to = normalizePhone(params.to);
  if (!to) return { ok: false, skipped: 'invalid_phone' };

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_TOKEN!;

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
            components: [
              {
                type: 'body',
                parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
              },
            ],
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
}): Promise<SendResult> {
  return sendWhatsAppTemplate({
    to: args.to,
    template: process.env.WHATSAPP_REMINDER_TEMPLATE ?? 'appointment_reminder',
    languageCode: args.languageCode ?? 'fr',
    bodyParams: [args.clientName || 'client', args.businessName, args.dateTimeLabel],
  });
}
