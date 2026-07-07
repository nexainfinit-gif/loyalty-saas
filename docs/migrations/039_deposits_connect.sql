-- 039: Stripe Connect + acomptes à la réservation (Phase B booking)
--
-- Les acomptes encaissent de l'argent POUR LE COMMERÇANT → chaque commerçant
-- connecte son propre compte Stripe (Connect Express), comme Planity/Salonkee.
-- Le paiement d'acompte est un Checkout créé SUR le compte connecté.
--
-- Flux : réservation avec acompte → RDV en statut 'pending_payment' (bloque
-- le créneau 30 min) → Checkout Stripe → retour payé → RDV 'confirmed' +
-- emails. Non payé sous 30 min → créneau libéré (annulation auto).

-- 1. Compte Stripe connecté du commerçant
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS stripe_account_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled  BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Réglages d'acompte
ALTER TABLE appointment_settings
  ADD COLUMN IF NOT EXISTS deposit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deposit_type    TEXT NOT NULL DEFAULT 'fixed'
    CHECK (deposit_type IN ('fixed', 'percent')),
  ADD COLUMN IF NOT EXISTS deposit_value   NUMERIC(10,2) NOT NULL DEFAULT 10;

-- 3. Rendez-vous : statut d'attente de paiement + traçabilité
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('confirmed', 'completed', 'cancelled', 'no_show', 'pending_payment'));

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS deposit_amount             NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_pending_payment
  ON appointments (staff_id, date, status) WHERE status = 'pending_payment';
