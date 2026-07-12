-- 054 — Stripe Connect pour les affiliés (paiement automatique des commissions).

-- Compte Connect Express de l'affilié (onboarding Stripe hébergé).
ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

-- Accepter les candidatures en attente.
ALTER TABLE affiliates
  DROP CONSTRAINT IF EXISTS affiliates_status_check;
ALTER TABLE affiliates
  ADD CONSTRAINT affiliates_status_check CHECK (status IN ('active', 'inactive', 'pending'));

-- Stripe Transfer ID sur chaque commission payée.
ALTER TABLE affiliate_commissions
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;
