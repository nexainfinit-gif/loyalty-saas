-- 020_referral_system.sql
-- Referral system: settings, customer fields, audit table, and helper function.

-- ── Referral settings on loyalty_settings (per restaurant) ──────────────────

ALTER TABLE loyalty_settings
  ADD COLUMN IF NOT EXISTS referral_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_reward_referrer integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS referral_reward_referee integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS referral_max_per_customer integer NOT NULL DEFAULT 10;

-- ── Referral fields on customers ────────────────────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_referral_code
  ON customers(restaurant_id, referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_referred_by
  ON customers(referred_by)
  WHERE referred_by IS NOT NULL;

-- ── Referrals audit table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  referrer_id uuid NOT NULL REFERENCES customers(id),
  referee_id uuid NOT NULL REFERENCES customers(id),
  referrer_reward integer NOT NULL,
  referee_reward integer NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'revoked', 'pending')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(restaurant_id, referee_id)
);

CREATE INDEX idx_referrals_restaurant ON referrals(restaurant_id);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referrals_owner_policy ON referrals
  FOR ALL USING (
    restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
  );

-- ── Referral code generator function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS text AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
