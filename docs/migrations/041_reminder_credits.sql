-- 041 — Monétisation des rappels WhatsApp (modèle hybride)
-- Quota mensuel inclus par plan + solde de crédits achetés en packs (dépassement).
-- Le rappel Wallet gratuit ne consomme JAMAIS ni quota ni crédit.

-- Quota mensuel de rappels WhatsApp inclus dans l'abonnement (NULL = illimité).
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS included_reminders_per_month integer;

UPDATE plans SET included_reminders_per_month = 100 WHERE key = 'starter';
UPDATE plans SET included_reminders_per_month = 300 WHERE key = 'growth';
UPDATE plans SET included_reminders_per_month = 800 WHERE key = 'pro';

-- Solde de crédits de rappels (packs de dépassement achetés à Rebites).
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS reminder_credits integer NOT NULL DEFAULT 0;

-- Journal des achats / ajustements de crédits (transparence commerçant + audit).
-- La consommation courante se dérive du compteur appointment_reminders (type
-- 'whatsapp') ; ce ledger ne trace que les mouvements de SOLDE (packs, admin).
CREATE TABLE IF NOT EXISTS reminder_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  delta integer NOT NULL,                 -- +N pack acheté, -N ajustement
  reason text NOT NULL,                   -- 'purchase' | 'admin_adjust'
  balance_after integer,
  stripe_checkout_session_id text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_ledger_restaurant
  ON reminder_credit_ledger(restaurant_id, created_at DESC);

-- Idempotence de l'ajout de crédits par le webhook Stripe (une session = un crédit).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reminder_ledger_session
  ON reminder_credit_ledger(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE reminder_credit_ledger ENABLE ROW LEVEL SECURITY;
