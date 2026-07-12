-- 053 — Programme d'affiliation B2B.
-- Les affiliés ramènent des établissements (via un lien ?ref=CODE à l'onboarding).
-- Commission récurrente : % de chaque paiement Stripe tant que le client reste.

-- ── Affiliés ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliates (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  code            TEXT NOT NULL UNIQUE,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 20.00,  -- pourcentage (ex: 20.00 = 20%)
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(code);
CREATE INDEX IF NOT EXISTS idx_affiliates_email ON affiliates(email);

-- ── Parrainages (un établissement → un affilié) ──────────────────────────────

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id);

CREATE INDEX IF NOT EXISTS idx_restaurants_affiliate ON restaurants(affiliate_id)
  WHERE affiliate_id IS NOT NULL;

-- ── Commissions (une ligne par paiement Stripe générant une commission) ───────

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id      UUID NOT NULL REFERENCES affiliates(id),
  restaurant_id     UUID NOT NULL REFERENCES restaurants(id),
  stripe_invoice_id TEXT NOT NULL,
  invoice_amount    INTEGER NOT NULL,          -- montant facturé en centimes
  commission_amount INTEGER NOT NULL,          -- commission en centimes
  commission_rate   NUMERIC(5,2) NOT NULL,     -- taux appliqué à ce paiement
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stripe_invoice_id, affiliate_id)      -- idempotence webhook
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate ON affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_restaurant ON affiliate_commissions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON affiliate_commissions(status) WHERE status = 'pending';
