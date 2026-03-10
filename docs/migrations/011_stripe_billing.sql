-- ═══════════════════════════════════════════════════════
-- STRIPE BILLING — SUPABASE MIGRATION
-- ═══════════════════════════════════════════════════════

-- Add Stripe fields to restaurants
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status     text DEFAULT 'inactive'
    CHECK (subscription_status IN ('active','inactive','past_due','canceled')),
  ADD COLUMN IF NOT EXISTS current_period_end      timestamptz;

CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_customer
  ON restaurants (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_subscription
  ON restaurants (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Add Stripe price mapping to plans
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS stripe_price_id text UNIQUE;

-- After running this migration, set stripe_price_id for each paid plan:
-- UPDATE plans SET stripe_price_id = 'price_xxx' WHERE key = 'pro';
-- The 'free' plan keeps stripe_price_id = NULL.
