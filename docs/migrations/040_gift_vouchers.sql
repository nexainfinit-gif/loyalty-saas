-- 040: Bons cadeaux (Phase B2)
-- Achat public payé sur le compte Stripe Connect du commerçant (B0).
-- Cycle : pending_payment → active (payé, code envoyé par email) → redeemed.
CREATE TABLE IF NOT EXISTS gift_vouchers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL UNIQUE,
  amount          NUMERIC(10,2) NOT NULL,
  buyer_name      TEXT NOT NULL,
  buyer_email     TEXT NOT NULL,
  recipient_name  TEXT,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'active', 'redeemed', 'cancelled')),
  stripe_checkout_session_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ,
  redeemed_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gift_vouchers_restaurant ON gift_vouchers(restaurant_id, status);
ALTER TABLE gift_vouchers ENABLE ROW LEVEL SECURITY;
