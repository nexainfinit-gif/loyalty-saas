/**
 * Packs de crédits de rappels WhatsApp (dépassement du quota mensuel inclus).
 *
 * Revenu Rebites → facturés sur le compte Stripe PLATEFORME (pas Connect).
 * Coût réel ~0,04 €/rappel → marge brute ≈ 58-60 % par pack (cible 66 % au
 * global, le quota inclus dans l'abonnement porte le reste).
 */
export const REMINDER_PACKS = {
  small: { credits: 200, priceCents: 1900, label: '200 rappels' },
  large: { credits: 500, priceCents: 3900, label: '500 rappels' },
} as const;

export type ReminderPackId = keyof typeof REMINDER_PACKS;

export function isReminderPackId(v: unknown): v is ReminderPackId {
  return typeof v === 'string' && v in REMINDER_PACKS;
}
